import os, sys, json, math, argparse, datetime as dt
from pathlib import Path
import pandas as pd
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

sys.path.append(str(ROOT))
from data.providers.alpha_providers import list_tickers, grouped_daily

CONF = yaml.safe_load(open(ROOT / "config" / "alpha_scoring.yml"))
U = CONF.get("universe", {})
PRICE_MIN = U.get("price_min", 1.0)
PRICE_MAX = U.get("price_max", 100.0)

def last_trading_days(n=30):
    # take last n+10 calendar days, keep those where grouped_daily returns data
    days = []
    today = dt.date.today()
    for i in range(1, n+40):  # pad for holidays/weekends
        d = today - dt.timedelta(days=i)
        if d.weekday() < 5:  # Mon-Fri heuristic
            days.append(d)
        if len(days) >= (n+10):
            break
    return [d.isoformat() for d in days]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=None, help="max tickers to include from reference list (overrides config)")
    ap.add_argument("--days", type=int, default=30, help="feature lookback days")
    args = ap.parse_args()

    print("📇 Fetching full ticker list...")
    U_MAX = U.get("max_tickers", 6000)
    universe = list_tickers()
    if not universe:
        print("❌ No tickers from reference API", file=sys.stderr); sys.exit(1)
    universe = universe[:U_MAX]
    if args.max:
        universe = universe[:args.max]
    print(f"✅ Universe size: {len(universe)}")

    print("📆 Pulling grouped daily bars...")
    days = last_trading_days(args.days)
    # Collect time-series rows per day
    frames = []
    for d in days:
        res = grouped_daily(d)
        if not res: 
            continue
        # Polygon returns 'T' ticker; keep only our universe
        df = pd.DataFrame(res)[["T","o","h","l","c","v"]]
        df = df[df["T"].isin(universe)]
        if df.empty:
            continue
        df["date"] = d
        frames.append(df)

    if not frames:
        print("❌ No grouped daily frames collected", file=sys.stderr); sys.exit(1)

    big = pd.concat(frames, ignore_index=True)
    # DON'T filter by price here - compute features for ALL symbols first

    # ---- features per symbol ----
    # order newest first by date (days already descending from last_trading_days)
    big["date"] = pd.to_datetime(big["date"])
    big.sort_values(["T","date"], ascending=[True, False], inplace=True)

    def feats(df):
        # df: rows for one symbol, newest first
        if len(df) < 6: 
            return None
        c = df["c"].values
        h = df["h"].values
        l = df["l"].values
        v = df["v"].values
        # ADV & $vol (mean over lookback)
        adv = float(np.nanmean(v))
        avg_dollar = float(np.nanmean(c * v))
        # ATR% (rough): mean((H-L).rolling?) / last close
        tr = np.maximum(h - l, np.maximum(np.abs(h - np.r_[c[1:], c[-1]]), np.abs(l - np.r_[c[1:], c[-1]])))
        atr = float(np.nanmean(tr))
        atr_pct = float(atr / c[0]) if c[0] else 0.0
        # momentum
        ret_5d = float(c[0] / c[5] - 1.0) if len(c) > 5 and c[5] else 0.0
        ret_21d = float(c[0] / c[21] - 1.0) if len(c) > 21 and c[21] else 0.0
        # 20D breakout using closes
        look = min(21, len(c)-1)
        hh20 = float(np.nanmax(c[1:look+1])) if look >= 2 else np.nan
        breakout20 = bool((not math.isnan(hh20)) and (c[0] >= hh20 * (1.0 + CONF["monthly"].get("breakout_buffer", 0.01))))
        return {
            "symbol": df["T"].iloc[0],
            "price": float(c[0]),
            "adv": adv,
            "avg_dollar": avg_dollar,
            "atr_pct": atr_pct,
            "ret_5d": ret_5d,
            "ret_21d": ret_21d,
            "breakout20": breakout20,
        }

    print("🧮 Computing features...")
    feats_list = []
    for sym, sdf in big.groupby("T"):
        f = feats(sdf)
        if f: feats_list.append(f)
    fdf = pd.DataFrame(feats_list)
    print(f"✅ Features for {len(fdf)} symbols")
    
    # NOW filter by latest close price only
    pre_count = len(fdf)
    fdf = fdf[(fdf["price"] >= PRICE_MIN) & (fdf["price"] <= PRICE_MAX)]
    print(f"🏷️ Price-band filter: kept {len(fdf)}/{pre_count} by latest close ${PRICE_MIN}-{PRICE_MAX}")
    
    # Coverage guard
    cov = len(fdf) / max(1, len(universe))
    req = U.get("require_feature_coverage", 0.8)
    if cov < req:
        msg = f"⚠️ Feature coverage {cov:.1%} < required {req:.0%}"
        if U.get("fail_if_under", False):
            raise SystemExit(msg)
        else:
            print(msg, file=sys.stderr)

    # Save cache
    out_parq = OUT_DIR / "universe_features.parquet"
    out_json = OUT_DIR / "universe.json"
    fdf.to_parquet(out_parq, index=False)
    out_json.write_text(json.dumps({"symbols": fdf["symbol"].tolist()}))
    print(f"💾 Wrote {out_parq} and {out_json}")

if __name__ == "__main__":
    main()