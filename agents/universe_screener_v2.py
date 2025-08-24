#!/usr/bin/env python3
# --- canary/version -----------------------------------------------------------
import sys, os, hashlib, time
__VERSION__ = "v2.3.1-canary"  # bump when changed
__FILE__ = os.path.realpath(__file__)
__SHA12__ = hashlib.sha256(open(__FILE__,'rb').read()).hexdigest()[:12]
print(f"[canary] {__VERSION__} file={__FILE__} sha={__SHA12__} t={int(time.time())}")
print("[argv@entry]", " | ".join(sys.argv))

"""
Universe Screener V2 - Two-Stage Pipeline for Fast Results
Stage 1: Fast filtering with cached data only (no API calls)
Stage 2: Async enrichment for top candidates
"""

import json, argparse, tempfile
from pathlib import Path
import pandas as pd
import numpy as np
import yaml
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
CONF = yaml.safe_load(open(ROOT / "config" / "alpha_scoring.yml"))
UCFG = CONF.get("universe", {})
FEAT_PATH = ROOT / "data" / "universe_features.parquet"

sys.path.append(str(ROOT))
from data.providers.alpha_providers import minute_bars, short_metrics

def ensure_dir(path: str):
    """Ensure parent directory exists for the given file path"""
    d = os.path.dirname(path)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)

def write_json_atomic(obj, out_path: str):
    """Atomically write JSON to prevent partial reads"""
    ensure_dir(out_path)
    dir_name = os.path.dirname(out_path) or "."
    fd, tmp_path = tempfile.mkstemp(prefix=".json_tmp_", dir=dir_name, text=True)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, out_path)  # atomic on POSIX
    except Exception as e:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise

def safe_write_json(out_path: str, payload: dict):
    """Write JSON with fallback to prevent caller seeing 'no output'"""
    try:
        write_json_atomic(payload, out_path)
        print(f"[json_out:success] {out_path}", file=sys.stderr)
    except Exception as e:
        print(f"[json_out:fallback] {e}", file=sys.stderr)
        # Fallback: at minimum write empty valid JSON
        try:
            Path(out_path).write_text('[]')
            print(f"[json_out:minimal] wrote empty array to {out_path}", file=sys.stderr)
        except Exception as inner:
            print(f"[json_out:fatal] all writes failed: {inner}", file=sys.stderr)
            raise inner

def minimal_payload(status="ok", items=None, meta=None):
    """Create minimal valid JSON payload"""
    return {
        "status": status,
        "count": len(items or []),
        "items": items or [],
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            **(meta or {})
        }
    }

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

def score_row_cheap(row, relvol=0.0):
    """Progressive Squeeze Scoring - Focus on momentum and volatility"""
    r5 = row.get("ret_5d", 0) or 0
    r21 = row.get("ret_21d", 0) or 0
    price = row.get("price", 0) or 0
    atr_pct = (row.get("atr_pct", 0) or 0) * 100
    avg_dollar = row.get("avg_dollar", 0) or 0
    
    # Base score
    score = 45
    
    # Momentum & Volume (40% weight = max 30 points) 
    momentum_score = momentum_points(r5, r21)  # 0-25 from existing function
    
    # Volume confirmation boost
    if relvol >= 2.5: 
        momentum_score = min(30, momentum_score + 10)  # Strong volume burst
    elif relvol >= 2.0: 
        momentum_score = min(30, momentum_score + 7)   # Good volume
    elif relvol >= 1.5: 
        momentum_score = min(30, momentum_score + 4)   # Elevated volume
    
    score += momentum_score
    
    # Volatility & Breakout Potential (30% weight = max 20 points)
    volatility_score = 0
    if atr_pct >= 8.0:  # Very high volatility (explosive potential)
        volatility_score += 15
    elif atr_pct >= 5.0:  # High volatility
        volatility_score += 10
    elif atr_pct >= 3.0:  # Moderate volatility
        volatility_score += 6
    elif atr_pct >= 2.0:  # Some volatility
        volatility_score += 3
        
    if bool(row.get("breakout20")):  # Technical breakout pattern
        volatility_score += 5
        
    score += min(20, volatility_score)
    
    # Price Tier Bonus (micro-cap advantage)
    if price <= 2.0:  # Ultra micro-cap
        score += 8
    elif price <= 5.0:  # Micro-cap  
        score += 5
    elif price <= 10.0:  # Small-cap
        score += 2
    
    # Liquidity Quality (ensures tradability)
    if price < 5.0:  # Micro-cap tier
        if avg_dollar >= 2_000_000:
            score += 3
        elif avg_dollar >= 1_000_000:
            score += 2
    else:  # Regular tier
        if avg_dollar >= 10_000_000:
            score += 3
        elif avg_dollar >= 5_000_000:
            score += 2
    
    return max(35, min(100, score))

def map_action(score):
    """Map score to action with updated thresholds"""
    if score >= 75: return "BUY"
    elif score >= 65: return "EARLY_READY"  
    elif score >= 55: return "PRE_BREAKOUT"
    elif score >= 50: return "WATCHLIST"
    else: return "MONITOR"

class UniverseScreenerV2:
    def __init__(self):
        self.polygon_api_key = os.getenv("POLYGON_API_KEY")
        self.criteria = {
            "min_price": 0.10,
            "max_price": 100.0,
        }
        self.shortlist_target = 1000
        self.shortlist_min = 500
        
        print(f"🚀 Universe Screener V2 initialized (two-stage pipeline)", file=sys.stderr)
        print(f"📊 Config: price ${self.criteria['min_price']}-${self.criteria['max_price']}", file=sys.stderr)
    
    def screen_universe_fast(self, limit: int = 50, exclude_symbols: str = "", budget_ms: int = 30000) -> list:
        """Progressive Squeeze Filter Pipeline: Price → Squeeze → Liquidity → Momentum → Score"""
        start_time = time.time()
        
        # Parse exclude list
        exclude_list = [s.strip().upper() for s in exclude_symbols.split(',') if s.strip()] if exclude_symbols else []
        
        # Load cached features with fallback
        universe_mode = os.getenv("UNIVERSE_MODE", "auto")  # live | cached | auto
        
        if universe_mode == "cached":
            print("🔧 UNIVERSE_MODE=cached: forcing cached-only mode", file=sys.stderr)
            if not FEAT_PATH.exists():
                print("❌ Cached mode requested but no cached features found", file=sys.stderr)
                return []
            rows_df = pd.read_parquet(FEAT_PATH)
            original_count = len(rows_df)
        elif universe_mode == "live":
            print("🔧 UNIVERSE_MODE=live: attempting live fetch", file=sys.stderr)
            # For now, live mode falls back to cached since we don't have a live fetch implemented
            # This would be where you'd call fetch_live_universe() if implemented
            try:
                print("📦 Loading cached features (live mode fallback)...", file=sys.stderr)
                rows_df = pd.read_parquet(FEAT_PATH)
                original_count = len(rows_df)
            except Exception as e:
                print(f"❌ Live mode failed, no fallback available: {e}", file=sys.stderr)
                return []
        else:
            # auto mode (default behavior)
            try:
                if not FEAT_PATH.exists():
                    raise FileNotFoundError("No cached features found")
                
                print("📦 Loading cached universe features...", file=sys.stderr)
                rows_df = pd.read_parquet(FEAT_PATH)
                original_count = len(rows_df)
            except (FileNotFoundError, Exception) as e:
                print(f"❌ Failed to load universe features: {e}", file=sys.stderr)
                print("🔄 Falling back to seed symbols...", file=sys.stderr)
                
                # Try to load from symbols_seed.json
                try:
                    seed_path = ROOT / "symbols_seed.json"
                    with open(seed_path, 'r') as f:
                        seed_symbols = json.load(f)
                    
                    # Create minimal dataframe with seed symbols
                    rows_df = pd.DataFrame({
                        'symbol': seed_symbols,
                        'price': [50.0] * len(seed_symbols),  # Default price
                        'ret_5d': [0.02] * len(seed_symbols),  # Default 2% return
                        'ret_21d': [0.05] * len(seed_symbols), # Default 5% return
                        'atr_pct': [0.05] * len(seed_symbols), # Default 5% ATR
                        'avg_dollar': [1000000] * len(seed_symbols), # Default $1M daily volume
                        'adv': [100000] * len(seed_symbols),   # Default 100K average volume
                        'breakout20': [False] * len(seed_symbols)
                    })
                    original_count = len(rows_df)
                    print(f"📦 Loaded {len(seed_symbols)} seed symbols as fallback", file=sys.stderr)
                    
                except Exception as fallback_error:
                    print(f"❌ Seed fallback also failed: {fallback_error}", file=sys.stderr)
                    return []
        
        # Exclude holdings
        rows_df = rows_df[~rows_df["symbol"].isin(exclude_list)]
        print(f"📊 Loaded features for {len(rows_df)} symbols (excluding {len(exclude_list)} holdings)", file=sys.stderr)
        
        # STAGE 0: Universe Filter - Price Band $0.10-$100
        price_filtered = rows_df[
            (rows_df["price"] >= 0.10) & 
            (rows_df["price"] <= 100.0) &
            (rows_df.get("adv", 0) >= 200000)  # Basic liquidity filter
        ]
        print(f"🎯 Stage 0 (Price $0.10-$100): {original_count} → {len(price_filtered)} candidates", file=sys.stderr)
        
        # STAGE 1: Liquidity Filter (focus on tradeable stocks)
        # Higher liquidity requirements based on price tier
        liquidity_filtered = price_filtered[
            (
                (price_filtered["avg_dollar"] >= 1_000_000) |  # Standard liquidity
                ((price_filtered["price"] < 5.0) & (price_filtered["avg_dollar"] >= 500_000))  # Micro-cap allowance
            )
        ]
        print(f"🎯 Stage 1 (Liquidity): {len(price_filtered)} → {len(liquidity_filtered)} candidates", file=sys.stderr)
        
        # STAGE 2: Volatility & Movement Filter
        # Focus on stocks with expansion potential
        volatility_filtered = liquidity_filtered[
            (liquidity_filtered["atr_pct"] >= 0.03) |  # 3%+ ATR (expansion potential) OR
            (liquidity_filtered["ret_5d"] >= 0.08) |   # 8%+ 5-day momentum OR  
            (liquidity_filtered["ret_21d"] >= 0.20)    # 20%+ 21-day momentum
        ]
        print(f"🎯 Stage 2 (Volatility): {len(liquidity_filtered)} → {len(volatility_filtered)} candidates", file=sys.stderr)
        
        # STAGE 3: Momentum Strength Filter  
        # Final filter for stocks showing real momentum
        momentum_filtered = volatility_filtered[
            (volatility_filtered["ret_5d"] >= 0.02) |   # 2%+ recent momentum OR
            (volatility_filtered["ret_21d"] >= 0.10) |  # 10%+ intermediate momentum OR
            (volatility_filtered["atr_pct"] >= 0.05)    # 5%+ volatility (breakout potential)
        ]
        
        # Pre-score all candidates by signal strength (no API calls)
        momentum_filtered = momentum_filtered.copy()  # Avoid SettingWithCopyWarning
        momentum_filtered["pre_score"] = (
            momentum_filtered["ret_5d"] * 40 +      # Recent momentum weight
            momentum_filtered["ret_21d"] * 30 +     # Intermediate momentum  
            momentum_filtered["atr_pct"] * 20 +     # Volatility bonus
            (momentum_filtered["adv"] / 1e6) * 0.1  # Liquidity factor
        )
        
        # Add seeded hash for deterministic tie-breaking
        if hasattr(self, 'seed') and self.seed:
            import hashlib
            momentum_filtered["hash_rank"] = momentum_filtered["symbol"].apply(
                lambda x: int(hashlib.md5(f"{x}{self.seed}".encode()).hexdigest()[:8], 16)
            )
        else:
            momentum_filtered["hash_rank"] = 0
        
        # Sort by pre_score (best first), then hash for determinism
        momentum_filtered = momentum_filtered.sort_values(
            by=["pre_score", "hash_rank"], 
            ascending=[False, True]
        ).reset_index(drop=True)
        
        # Take top candidates within shortlist target
        shortlist_size = min(self.shortlist_target, len(momentum_filtered))
        momentum_filtered = momentum_filtered.head(shortlist_size)
        symbols = momentum_filtered["symbol"].tolist()
        
        print(f"🎯 Stage 3 (Momentum/Flow): {len(liquidity_filtered)} → {len(symbols)} final candidates", file=sys.stderr)
        
        # STAGE 1.5: Quick scoring (no API calls)
        candidates = []
        for sym in symbols[:limit * 3]:  # Process 3x limit for better selection
            if time.time() - start_time > budget_ms / 1000:
                print(f"⏰ Budget exceeded, returning {len(candidates)} candidates", file=sys.stderr)
                break
            
            row = momentum_filtered.loc[momentum_filtered["symbol"]==sym].iloc[0].to_dict()
            
            # Get cached relative volume if available
            relvol = 1.0  # Default if not available
            try:
                # Try to get from minute bars with very short timeout
                mins = minute_bars(sym)
                if mins and len(mins) >= 5:
                    dfm = pd.DataFrame(mins).rename(columns=str.lower, inplace=False)
                    last30 = float(dfm['v'].tail(30).sum())
                    adv = row.get("adv", 0)
                    avg_min = (adv/(6.5*60)) if adv>0 else 0
                    relvol = (last30/(avg_min*30)) if avg_min>0 else 1.0
            except:
                pass  # Use default relvol
            
            # Fast scoring
            score = score_row_cheap(row, relvol)
            action = map_action(score)
            
            # Progressive Momentum Thesis (based on available data)
            ret_5d = (row.get("ret_5d", 0) or 0) * 100
            ret_21d = (row.get("ret_21d", 0) or 0) * 100
            price = row.get("price", 0) or 0
            atr_pct = (row.get("atr_pct", 0) or 0) * 100
            avg_dollar = row.get("avg_dollar", 0) or 0
            
            thesis_parts = []
            
            # Price tier classification
            if price <= 2.0:
                thesis_parts.append(f"Ultra micro-cap ${price:.2f}")
            elif price <= 5.0:
                thesis_parts.append(f"Micro-cap ${price:.2f}")
            elif price <= 10.0:
                thesis_parts.append(f"Small-cap ${price:.2f}")
            else:
                thesis_parts.append(f"${price:.2f} stock")
            
            # Momentum narrative
            if ret_5d >= 20:
                thesis_parts.append(f"explosive momentum (+{ret_5d:.0f}% 5d)")
            elif ret_5d >= 10:
                thesis_parts.append(f"strong momentum (+{ret_5d:.1f}% 5d)")
            elif ret_5d >= 3:
                thesis_parts.append(f"building momentum (+{ret_5d:.1f}% 5d)")
            
            # Volatility potential
            if atr_pct >= 8:
                thesis_parts.append(f"high volatility ({atr_pct:.0f}% ATR)")
            elif atr_pct >= 4:
                thesis_parts.append(f"expanding volatility ({atr_pct:.1f}% ATR)")
            
            # Volume confirmation
            if relvol >= 2.5:
                thesis_parts.append(f"heavy volume burst ({relvol:.1f}x)")
            elif relvol >= 2.0:
                thesis_parts.append(f"strong volume ({relvol:.1f}x)")
            elif relvol >= 1.5:
                thesis_parts.append(f"elevated volume ({relvol:.1f}x)")
            
            # Breakout confirmation
            if bool(row.get("breakout20")):
                thesis_parts.append("technical breakout")
            
            thesis = ". ".join(thesis_parts[:4]) + f". Score: {score:.0f}"
            
            candidates.append({
                "ticker": sym,
                "symbol": sym,
                "price": round(row.get("price", 0), 2),
                "score": int(score),
                "action": action,
                "thesis": thesis,
                "thesis_tldr": thesis[:100],
                "rel_vol_30m": round(relvol, 1),
                "indicators": {
                    "relvol": round(relvol, 1),
                    "ret_5d": ret_5d,
                    "ret_21d": ret_21d,
                    "atr_pct": (row.get("atr_pct", 0) or 0) * 100,
                    "avg_dollar": row.get("avg_dollar", 0)
                },
                "targets": {
                    "entry": "Current levels",
                    "tp1": "+15%",
                    "tp2": "+30%",
                    "stop": "-8%"
                },
                "timestamp": time.time()
            })
        
        # Sort by score (desc), then relvol (desc), then price (asc), then ticker (asc) for stability
        candidates.sort(key=lambda x: (
            -x["score"],  # Descending score
            -x.get("rel_vol_30m", 0),  # Descending relative volume
            x["price"],  # Ascending price
            x["ticker"]  # Ascending ticker for final tie-breaking
        ))
        final = candidates[:limit]
        
        elapsed = time.time() - start_time
        print(f"✅ Stage 1 complete in {elapsed:.1f}s: {len(final)} candidates", file=sys.stderr)
        
        return final

def main(args):
    # json_out is already handled by argparse and sanitization
    pass
    
    # Handle replay mode - return saved snapshot
    if args.replay_json:
        with open(args.replay_json, 'r') as f:
            payload = json.load(f)
        # Echo back exactly what the API used (optionally trim to --limit)
        payload['items'] = payload['items'][:args.limit]
        print(json.dumps(payload))
        sys.exit(0)
    
    # Set random seed for deterministic results
    if args.seed is not None:
        import random
        random.seed(args.seed)
        np.random.seed(args.seed)
    
    start_time = time.time()
    
    # Create screener and run fast scan
    screener = UniverseScreenerV2()
    screener.seed = args.seed  # Pass seed to screener instance
    candidates = screener.screen_universe_fast(
        limit=args.limit, 
        exclude_symbols=args.exclude_symbols,
        budget_ms=args.budget_ms
    )
    
    duration_ms = int((time.time() - start_time) * 1000)
    
    # Create payload with metadata using minimal_payload format
    snapshot_ts = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    payload = minimal_payload(
        status="ok",
        items=candidates,
        meta={
            "schema_version": 1,
            "run_id": f"{snapshot_ts}-{args.seed or 'none'}",
            "snapshot_ts": snapshot_ts,
            "duration_ms": duration_ms,
            "partial": len(candidates) < args.limit,
            "params": {
                "seed": args.seed,
                "limit": args.limit,
                "budget_ms": args.budget_ms,
                "exclude_symbols": args.exclude_symbols
            }
        }
    )
    
    # Safe write with fallback
    safe_write_json(args.json_out, payload)
    print(f"[screener] wrote {len(candidates)} items to {args.json_out} in {duration_ms}ms", file=sys.stderr)
    return 0

if __name__ == "__main__":
    args = None
    try:
        parser = argparse.ArgumentParser(description='Universe Screener V2 - Fast Two-Stage Pipeline')
        parser.add_argument('--limit', type=int, default=50, help='Number of candidates to return')
        parser.add_argument('--exclude-symbols', type=str, default='', help='Comma-separated symbols to exclude')
        parser.add_argument(
            "--json-out", "--json_out",
            dest="json_out",
            nargs="?",                    # accept 0 or 1 values
            const="/tmp/discovery_screener.json",  # used if flag present w/o value
            default=os.getenv("JSON_OUT", "/tmp/discovery_screener.json"),
            help="Output path for discoveries JSON"
        )
        parser.add_argument('--budget-ms', type=int, default=30000, help='Time budget in milliseconds')
        parser.add_argument('--seed', type=int, default=None, help='Random seed for deterministic results')
        parser.add_argument('--replay-json', type=str, default=None, help='Replay a saved JSON payload (use same items/order)')
        args = parser.parse_args()
        
        # Handle the case where argparse saw the next token as a flag → missing value
        if not args.json_out or args.json_out.startswith("--"):
            print("[json_out:sanitize] missing/flag-collision detected; defaulting", file=sys.stderr)
            args.json_out = "/tmp/discovery_screener.json"
        
        # Normalize to absolute path and ensure dir exists
        args.json_out = str(Path(args.json_out).expanduser().absolute())
        Path(args.json_out).parent.mkdir(parents=True, exist_ok=True)
        
        print(f"[json_out:final] {args.json_out}", file=sys.stderr)
        
        # Log argv for debugging
        import sys; print("[screener argv]", " ".join(sys.argv))
        
        exit_code = main(args)
        sys.exit(exit_code)
    except SystemExit as se:
        # Normal exit - log argv for diagnosis 
        print(f"[screener] SystemExit {se.code}: {' '.join(sys.argv)}", file=sys.stderr)
        # Print final metrics before exit
        from data.providers.alpha_providers import print_metrics
        print_metrics()
        raise
    except Exception as e:
        # Last-resort JSON so the caller never sees "no output"
        print(f"[screener] FATAL exception {type(e).__name__}: {e}", file=sys.stderr)
        print(f"[screener] argv was: {' '.join(sys.argv)}", file=sys.stderr)
        fallback = minimal_payload(
            status="error",
            items=[],
            meta={
                "schema_version": 1,
                "error": type(e).__name__, 
                "message": str(e),
                "fallback": True
            }
        )
        try:
            out_path = args.json_out if args else "/tmp/discovery_screener.json"
            safe_write_json(out_path, fallback)
            print(f"[screener] wrote fallback JSON: {out_path}", file=sys.stderr)
        except Exception as inner:
            # Ultimate fallback - write empty array directly
            try:
                out_path = args.json_out if args else "/tmp/discovery_screener.json"
                Path(out_path).write_text("[]")
                print(f"[screener] ULTIMATE fallback: wrote empty array to {out_path}", file=sys.stderr)
            except Exception:
                print(f"[screener] FATAL and failed all JSON writes: {inner}", file=sys.stderr)
        sys.exit(1)