#!/usr/bin/env python3
"""
Universe Screener - Deterministic full-universe scanning
Loads cached features, applies adaptive narrowing, scores ALL survivors, slices at end
"""

import os, sys, json, argparse, time, math
from pathlib import Path
import pandas as pd
import numpy as np
import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
CONF = yaml.safe_load(open(ROOT / "config" / "alpha_scoring.yml"))
UCFG = CONF.get("universe", {})
FEAT_PATH = ROOT / "data" / "universe_features.parquet"

sys.path.append(str(ROOT))
from data.providers.alpha_providers import minute_bars, short_metrics

def ramp(x, lo, hi, max_pts):
    """Smooth ramp function for capped scoring"""
    if x is None: return 0
    if x <= lo: return 0
    if x >= hi: return max_pts
    return max_pts * (x - lo) / (hi - lo)

def momentum_points(r5, r21):
    """Capped momentum scoring to prevent double-counting"""
    p5 = ramp(r5 * 100, 2.0, 25.0, 10) if r5 else 0     # 5-day: 0-10 points
    p21 = ramp(r21 * 100, 8.0, 40.0, 15) if r21 else 0  # 21-day: 0-15 points
    return min(25, p5 + p21)                              # Cap total momentum at 25

def squeeze_synergy(float_shares, si_pct, borrow_fee):
    """Float + short interest + borrow fee synergy scoring"""
    pts = 0
    if float_shares is not None and float_shares <= 20_000_000: 
        pts += 10  # Micro-cap bonus
    if borrow_fee is not None:
        if borrow_fee >= 50: pts += 10
        elif borrow_fee >= 30: pts += 6
    # Synergy bonus for squeeze setup
    if (si_pct or 0) >= 15 and (borrow_fee or 0) >= 30: 
        pts += 6
    return pts

def live_penalties(price, vwap, rsi, ema9_ge_ema20, drawdown_from_hod):
    """Real-time tape quality penalties"""
    pts = 0
    if price is not None and vwap is not None and price < vwap: 
        pts -= 8  # Below VWAP penalty
    if rsi is not None and rsi > 75: 
        pts -= 6  # Exhaustion penalty
    if drawdown_from_hod is not None and drawdown_from_hod >= 0.20: 
        pts -= 8  # Large drawdown penalty
    return pts

def days_to_cover_bonus(short_shares, adv):
    """Days to cover squeeze potential"""
    if not short_shares or not adv or adv <= 0:
        return 0
    dtc = short_shares / adv
    if dtc >= 4: return 8
    if dtc >= 2: return 4
    return 0

def live_vs_cached_sanity_check(live_price, cached_price, score):
    """Penalize stale data with large price drift"""
    if not live_price or not cached_price:
        return score
    
    drift = abs(live_price - cached_price) / cached_price
    if drift >= 0.10:
        return max(0, score - 8)  # 8 point penalty for stale data
    
    return score

def detect_early_catalysts(row):
    """Detect early catalyst signals"""
    points = 0
    
    # PR keywords detection
    pr_keywords = ['FDA', 'approval', 'partnership', 'licensing', 
                   'contract', 'uplist', 'financing', 'acquisition']
    
    news_text = (row.get("recent_news") or "").lower()
    if any(keyword.lower() in news_text for keyword in pr_keywords):
        points += 15
    
    # Pre-market gap and volume
    pm_gap = row.get("premarket_gap_pct") or 0
    pm_relvol = row.get("relvol_pm") or 0
    
    if pm_gap >= 10 and pm_relvol >= 1.5:
        points += 12
    
    return points

def map_action(score):
    """Map score to action"""
    if score >= 85: return "BUY"
    elif score >= 75: return "EARLY_READY"
    elif score >= 65: return "PRE_BREAKOUT"
    elif score >= 50: return "WATCHLIST"
    else: return "MONITOR"

def map_action_with_tape(score, live_price, live_vwap, ema9_ge_ema20):
    """Action mapping with live tape validation"""
    base_action = map_action(score)
    
    # Tape guard: cap weak setups at PRE_BREAKOUT
    if score >= 65:
        below_vwap = (live_price and live_vwap and live_price < live_vwap)
        no_bullish_trend = not ema9_ge_ema20
        if below_vwap or no_bullish_trend:
            return "PRE_BREAKOUT"
    
    return base_action

class UniverseScreener:
    def __init__(self):
        self.polygon_api_key = os.getenv("POLYGON_API_KEY")
        
        # Use config-driven defaults - EXPANDED to include penny stocks
        astrat = CONF.get('prefilter_strategy', {})
        prefilters = CONF.get('prefilters', {})
        self.criteria = {
            "min_price": prefilters.get("price_min", 0.10),  # Include penny stocks
            "max_price": prefilters.get("price_max", 100.0),
        }
        self.shortlist_target = astrat.get("target_keep", 200)
        self.shortlist_min = astrat.get("min_keep", 120)
        
        print(f"🌌 Universe Screener initialized", file=sys.stderr)
        print(f"📊 Config: price ${self.criteria['min_price']}-${self.criteria['max_price']}, target={self.shortlist_target}, min={self.shortlist_min}", file=sys.stderr)
    
    def screen_universe(self, limit: int = 5, exclude_symbols: str = "", full_universe_mode: bool = False) -> list:
        """Screen the universe deterministically with optional full universe mode"""
        
        # Parse exclude list (robust)
        exclude_list = [s.strip().upper() for s in exclude_symbols.split(',') if s.strip()] if exclude_symbols else []
        
        # Load cached features (no network here)
        if FEAT_PATH.exists():
            print("📦 Loading cached universe features (parquet)...", file=sys.stderr)
            rows_df = pd.read_parquet(FEAT_PATH)
        else:
            print("❗ No cached features. Run: npm run universe:build2", file=sys.stderr)
            rows_df = pd.DataFrame(columns=["symbol","price","adv","avg_dollar","atr_pct","ret_5d","ret_21d","breakout20"])

        if exclude_list:
            rows_df = rows_df[~rows_df["symbol"].isin(exclude_list)]
            
        print(f"📊 Loaded features for {len(rows_df)} symbols (excluding {len(exclude_list)} holdings)", file=sys.stderr)

        # Check for full universe mode activation
        full_config = CONF.get("full_universe_mode", {})
        if not full_universe_mode and full_config.get("enabled", False):
            # Will check later if we need to activate full universe mode
            pass

        # Adaptive narrowing (deterministic) - NO random, keep enough names
        astrat = CONF.get("prefilter_strategy", {})
        full_config = CONF.get("full_universe_mode", {})
        
        # Use full universe parameters if in full mode
        if full_universe_mode:
            print("🚀 FULL UNIVERSE MODE: Scanning expanded universe for maximum opportunities", file=sys.stderr)
            adv_pct   = 20  # Very relaxed for full universe
            dol_pct   = 20
            atrp_pct  = 30
            step      = 2   # Smaller steps
            shortlist_target = full_config.get("target_keep", 2000)
            shortlist_min    = full_config.get("min_keep", 1000)
        else:
            adv_pct   = astrat.get("adv_pct_min", 40)
            dol_pct   = astrat.get("dollar_pct_min", 40) 
            atrp_pct  = astrat.get("atr_pct_min", 60)
            step      = astrat.get("step_percentile", 5)
            shortlist_target = astrat.get("target_keep", 200)
            shortlist_min    = astrat.get("min_keep", 120)

        def pct(a, p): 
            a = np.array(a, dtype=float)
            return float(np.nanpercentile(a, p)) if len(a) else np.nan

        advs = rows_df["adv"].to_numpy()
        dols = rows_df["avg_dollar"].to_numpy()
        atrs = rows_df["atr_pct"].to_numpy()

        while True:
            a_thr = pct(advs, adv_pct)
            d_thr = pct(dols, dol_pct)
            t_thr = pct(atrs, atrp_pct)
            base = rows_df[(rows_df["adv"]>=a_thr) & (rows_df["avg_dollar"]>=d_thr) & (rows_df["atr_pct"]>=t_thr)]
            hot  = rows_df[(rows_df["ret_5d"]>=0.10) | (rows_df["breakout20"]==True)]
            survivors_df = pd.concat([base, hot]).drop_duplicates(subset=["symbol"])
            if len(survivors_df) >= shortlist_min or (adv_pct<=10 and dol_pct<=10 and atrp_pct<=20):
                break
            adv_pct   = max(10, adv_pct - step)
            dol_pct   = max(10, dol_pct - step)
            atrp_pct  = max(20, atrp_pct - step)

        # Deterministic ranking; symbol as tie-breaker for stable order
        survivors_df = survivors_df.sort_values(
            ["avg_dollar","atr_pct","ret_5d","symbol"], ascending=[False,False,False,True]
        )
        symbols = survivors_df["symbol"].tolist()[:shortlist_target]
        print(f"🎯 Shortlist {len(symbols)} of {len(survivors_df)} (target {shortlist_target}); thresholds → adv%={adv_pct}, $vol%={dol_pct}, atr%={atrp_pct}", file=sys.stderr)

        # Final fallback if somehow empty
        if not symbols:
            rows_df = rows_df.sort_values(["avg_dollar","atr_pct","ret_5d","symbol"], ascending=[False,False,False,True])
            symbols = rows_df["symbol"].tolist()[:max(50, shortlist_min//2)]
            print(f"⚠️ Fallback shortlist used: {len(symbols)}", file=sys.stderr)

        # Score every survivor (NO partial sampling), then slice at the end
        def score_row(row, relvol=0.0):
            """Enhanced scoring with live tape validation"""
            r5 = row.get("ret_5d")
            r21 = row.get("ret_21d")

            # Start with base score
            score = 50

            # Capped momentum points (max 25)
            score += momentum_points(r5, r21)

            # Volatility bonus
            if (row.get("atr_pct") or 0) >= 0.03: 
                score += 10
            elif (row.get("atr_pct") or 0) >= 0.02: 
                score += 5

            # Volume bonus (use relative volume)
            if relvol > 2.0: 
                score += 15
            elif relvol > 1.5: 
                score += 8

            # Dollar volume bonus
            if (row.get("avg_dollar") or 0) >= 50_000_000: 
                score += 8
            elif (row.get("avg_dollar") or 0) >= 20_000_000: 
                score += 5

            # Breakout bonus
            if bool(row.get("breakout20")): 
                score += 12

            # Early catalyst detection
            score += detect_early_catalysts(row)

            # Squeeze synergy (using mock data for now)
            score += squeeze_synergy(
                row.get("float"), 
                row.get("short_interest_pct"), 
                row.get("borrow_fee_pct")
            )

            # Days to cover bonus
            score += days_to_cover_bonus(
                row.get("short_shares"), 
                row.get("adv")
            )

            # Live tape penalties (will be 0 for now since no live data yet)
            score += live_penalties(
                price=row.get("live_price"),
                vwap=row.get("live_vwap"),
                rsi=row.get("live_rsi"),
                ema9_ge_ema20=row.get("ema9_ge_ema20"),
                drawdown_from_hod=row.get("drawdown_from_hod")
            )

            # Live vs cached sanity check
            score = live_vs_cached_sanity_check(
                row.get("live_price"),
                row.get("price"),  # cached price
                score
            )

            return max(30, min(100, score))

        def generate_thesis(symbol, row, score, relvol, short_info=None):
            """Generate compelling investment thesis for a candidate"""
            price = row["price"]
            ret_5d = row.get("ret_5d", 0) * 100
            ret_21d = row.get("ret_21d", 0) * 100
            atr_pct = row.get("atr_pct", 0) * 100
            avg_dollar = row.get("avg_dollar", 0) / 1e6
            breakout = row.get("breakout20", False)
            
            # Build thesis components
            thesis_parts = []
            
            # Momentum story
            if ret_5d >= 5:
                thesis_parts.append(f"Strong momentum with +{ret_5d:.0f}% 5-day move")
            elif ret_5d >= 2:
                thesis_parts.append(f"Building momentum (+{ret_5d:.1f}% 5-day)")
            
            # Volume confirmation
            if relvol > 2.0:
                thesis_parts.append(f"High conviction with {relvol:.1f}x volume spike")
            elif relvol > 1.5:
                thesis_parts.append(f"Institutional interest ({relvol:.1f}x volume)")
            
            # Technical setup
            if breakout:
                thesis_parts.append("20-day breakout setup confirmed")
            if atr_pct > 3:
                thesis_parts.append("High volatility expansion")
            
            # Liquidity/Size story
            if avg_dollar > 50:
                thesis_parts.append("Large cap with institutional backing")
            elif avg_dollar > 20:
                thesis_parts.append("Mid cap with growth potential")
            else:
                thesis_parts.append("Small cap momentum play")
            
            # Price targets and risk
            if ret_21d >= 15:
                target_mult = 1.10  # Conservative for already extended
                risk_note = "Take profits on strength"
            elif score >= 85:
                target_mult = 1.20  # Aggressive for high conviction
                risk_note = "High conviction trade"
            else:
                target_mult = 1.15  # Moderate target
                risk_note = "Monitor for confirmation"
            
            target_price = price * target_mult
            upside_pct = (target_mult - 1) * 100
            
            # Short squeeze potential
            squeeze_note = ""
            if short_info and short_info.get("short_interest", 0) > 0.15:
                si_pct = short_info["short_interest"] * 100
                fee_pct = short_info.get("borrow_fee", 0) * 100
                if fee_pct > 15:
                    squeeze_note = f" High short interest ({si_pct:.0f}%) + expensive borrow ({fee_pct:.0f}%) = squeeze potential."
                else:
                    squeeze_note = f" Elevated short interest ({si_pct:.0f}%) to watch."
            
            # Combine thesis
            if thesis_parts:
                main_thesis = ". ".join(thesis_parts[:3])  # Keep it concise
            else:
                main_thesis = "Technical momentum building"
                
            full_thesis = f"{main_thesis}. Target: ${target_price:.2f} (+{upside_pct:.0f}%). {risk_note}.{squeeze_note}"
            
            return {
                "thesis": full_thesis,
                "target_price": round(target_price, 2),
                "upside_pct": round(upside_pct, 0),
                "risk_note": risk_note
            }

        candidates = []
        for sym in symbols:  # score ALL shortlisted names deterministically
            row = survivors_df.loc[survivors_df["symbol"]==sym].iloc[0].to_dict()

            # Optional minute relvol (never used to DROP)
            relvol = 0.0
            try:
                mins = minute_bars(sym)
                if mins and len(mins) >= 5:
                    dfm = pd.DataFrame(mins).rename(columns=str.lower, inplace=False)
                    last30 = float(dfm['v'].tail(30).sum())
                    adv = row["adv"]
                    avg_min = (adv/(6.5*60)) if adv>0 else 0
                    relvol = (last30/(avg_min*30)) if avg_min>0 else 0.0
            except Exception:
                pass

            sc = score_row(row, relvol)
            
            # Generate thesis
            thesis_data = generate_thesis(sym, row, sc, relvol)
            
            # Enhanced action mapping with tape validation
            action = map_action_with_tape(
                sc,
                row.get("live_price"),
                row.get("live_vwap"),
                row.get("ema9_ge_ema20")
            )
            
            candidates.append({
                "symbol": sym,
                "score": int(round(sc)),
                "price": round(row["price"], 2),
                "rel_vol_30m": round(max(relvol, 1.0), 1),
                "action": action,
                "bucket": "trade-ready" if sc>=75 else ("watch" if sc>=60 else "monitor"),
                "thesis": thesis_data["thesis"],
                "target_price": thesis_data["target_price"],
                "upside_pct": thesis_data["upside_pct"],
                "risk_note": thesis_data["risk_note"],
                "tape_quality": "NEUTRAL"  # Will be enhanced with live data
            })

        # Late short-interest enrichment for squeeze bias (deterministic; top N)
        enrich_max = int(UCFG.get("enrich_short_max", 800))
        for c in candidates[:min(enrich_max, len(candidates))]:
            try:
                sm = short_metrics(c["symbol"]) or {}
                si  = sm.get("short_interest") or 0
                fee = sm.get("borrow_fee") or 0
                util= sm.get("utilization") or 0
                bonus = 0
                if si >= 0.20 and (fee >= 0.20 or util >= 0.85):
                    bonus = 10
                c["score"] = min(100, c["score"] + bonus)
                c["short_interest"] = round(si*100, 1) if si else None
                c["borrow_fee"] = round(fee*100, 1) if fee else None
                c["utilization"] = round(util*100, 1) if util else None
                
                # Update thesis with short squeeze info if significant
                if si > 0.15 or fee > 0.15:
                    # Regenerate thesis with short info
                    row = survivors_df.loc[survivors_df["symbol"]==c["symbol"]].iloc[0].to_dict()
                    relvol = c["rel_vol_30m"]
                    thesis_data = generate_thesis(c["symbol"], row, c["score"], relvol, sm)
                    c["thesis"] = thesis_data["thesis"]
                    
            except Exception:
                continue

        # Deterministic final sort & slice
        candidates.sort(key=lambda x: (x["score"], x["price"], x["symbol"]), reverse=True)
        final = candidates[:limit]
        
        print(f"Found {len(final)} universe candidates", file=sys.stderr)
        
        # Auto-activate full universe mode if too few candidates found
        if not full_universe_mode and len(final) < full_config.get("activate_when", 10) and full_config.get("enabled", False):
            print(f"🚀 AUTO-ACTIVATING FULL UNIVERSE MODE: Only {len(final)} candidates found, expanding search...", file=sys.stderr)
            return self.screen_universe(limit, exclude_symbols, full_universe_mode=True)
        
        return final

def main():
    parser = argparse.ArgumentParser(description='Deterministic Universe Stock Screener')
    parser.add_argument('--limit', type=int, default=5, help='Number of candidates to return')
    parser.add_argument('--exclude-symbols', type=str, default='', help='Comma-separated symbols to exclude')
    parser.add_argument('--full-universe', action='store_true', help='Force full universe scan (up to 2000 stocks)')
    
    args = parser.parse_args()
    
    # Create screener and run scan
    screener = UniverseScreener()
    candidates = screener.screen_universe(args.limit, args.exclude_symbols, full_universe_mode=args.full_universe)
    
    # Output as JSON for API consumption
    print(json.dumps(candidates))

if __name__ == "__main__":
    main()