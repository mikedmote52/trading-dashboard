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

class UniverseScreener:
    def __init__(self):
        self.polygon_api_key = os.getenv("POLYGON_API_KEY")
        
        # Use config-driven defaults
        astrat = CONF.get('prefilter_strategy', {})
        self.criteria = {
            "min_price": UCFG.get("price_min", 1.0),
            "max_price": UCFG.get("price_max", 100.0),
        }
        self.shortlist_target = astrat.get("target_keep", 200)
        self.shortlist_min = astrat.get("min_keep", 120)
        
        print(f"🌌 Universe Screener initialized", file=sys.stderr)
        print(f"📊 Config: price ${self.criteria['min_price']}-${self.criteria['max_price']}, target={self.shortlist_target}, min={self.shortlist_min}", file=sys.stderr)
    
    def screen_universe(self, limit: int = 5, exclude_symbols: str = "") -> list:
        """Screen the entire universe deterministically"""
        
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

        # Adaptive narrowing (deterministic) - NO random, keep enough names
        astrat = CONF.get("prefilter_strategy", {})
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
            score = 50
            if relvol > 2.0: score += 15
            elif relvol > 1.5: score += 8
            if row["atr_pct"] > 0.03: score += 10
            elif row["atr_pct"] > 0.02: score += 5
            if row["ret_5d"] >= 0.05: score += 10
            elif row["ret_5d"] >= 0.02: score += 5
            if row["ret_21d"] >= 0.15: score += 15
            elif row["ret_21d"] >= 0.08: score += 8
            if bool(row["breakout20"]): score += 12
            if row["avg_dollar"] > 50_000_000: score += 8
            elif row["avg_dollar"] > 20_000_000: score += 5
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
            
            candidates.append({
                "symbol": sym,
                "score": int(round(sc)),
                "price": round(row["price"], 2),
                "rel_vol_30m": round(max(relvol, 1.0), 1),
                "bucket": "trade-ready" if sc>=75 else ("watch" if sc>=60 else "monitor"),
                "thesis": thesis_data["thesis"],
                "target_price": thesis_data["target_price"],
                "upside_pct": thesis_data["upside_pct"],
                "risk_note": thesis_data["risk_note"]
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
        return final

def main():
    parser = argparse.ArgumentParser(description='Deterministic Universe Stock Screener')
    parser.add_argument('--limit', type=int, default=5, help='Number of candidates to return')
    parser.add_argument('--exclude-symbols', type=str, default='', help='Comma-separated symbols to exclude')
    
    args = parser.parse_args()
    
    # Create screener and run scan
    screener = UniverseScreener()
    candidates = screener.screen_universe(args.limit, args.exclude_symbols)
    
    # Output as JSON for API consumption
    print(json.dumps(candidates))

if __name__ == "__main__":
    main()