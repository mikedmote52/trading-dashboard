import os, sys, json, time, argparse, requests, datetime as dt
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CONF = __import__('yaml').safe_load(open(ROOT/'config'/'alpha_scoring.yml'))
POLY = os.getenv('POLYGON_API_KEY')
OUTF = ROOT/'data'/'universe.json'
(OUTF.parent).mkdir(parents=True, exist_ok=True)

def _get(url, params=None):
    for i in range(3):
        r = requests.get(url, params=params, timeout=20)
        if r.status_code == 200: return r.json()
        time.sleep(0.4*(i+1))
    return {}

def list_symbols(exchanges=('XNYS','XNAS'), limit=1000, max_pages=5):
    # Polygon v3 reference tickers (stocks)
    url = "https://api.polygon.io/v3/reference/tickers"
    params = {"market":"stocks","active":"true","sort":"ticker","order":"asc","limit":limit,"apiKey":POLY}
    symbols = []
    cursor = None
    pages = 0
    while pages < max_pages:
        p = dict(params)
        if cursor: p["cursor"]=cursor
        j = _get(url, p)
        results = j.get("results", [])
        for r in results:
            if r.get("primary_exchange") in exchanges and not r.get("ticker","").endswith(".W"):
                symbols.append(r["ticker"])
        cursor = j.get("next_url", None)
        if not cursor: break
        # next_url already includes apiKey; continue via 'cursor' param if provided by your plan
        pages += 1
    return symbols

def daily_bars(sym, days=30):
    url = f"https://api.polygon.io/v2/aggs/ticker/{sym}/range/1/day/now-{days}d/now"
    j = _get(url, {"adjusted":"true","sort":"desc","limit":days,"apiKey":POLY})
    return j.get("results", [])

def atr_pct(df, period=14):
    h,l,c = df['h'],df['l'],df['c']
    hl = (h - l).abs()
    hc = (h - c.shift()).abs()
    lc = (l - c.shift()).abs()
    tr = pd.concat([hl,hc,lc], axis=1).max(axis=1)
    atr = tr.rolling(period).mean()
    last_c = c.iloc[-1] if len(c)>0 else 0
    return float((atr.iloc[-1]/last_c) if last_c else 0)

def main(max_symbols=400, price_min=1.0, price_max=100.0):
    if not POLY:
        print("Missing POLYGON_API_KEY"); sys.exit(1)
    print("Fetching active tickers…")
    universe = list_symbols()
    print(f"Reference symbols: {len(universe)}")
    kept = []
    for i,sym in enumerate(universe):
        try:
            d = daily_bars(sym, 30)
            if not d: continue
            df = pd.DataFrame(d)[['o','h','l','c','v']].rename(columns=str.lower, inplace=False)
            last = df.iloc[0]
            price = float(last['c'])
            if not (price_min <= price <= price_max): continue
            adv = float(df['v'].mean())
            avg_dollar = float((df['c']*df['v']).mean())
            apct = atr_pct(df, 14)
            if adv < CONF['prefilters']['adv_shares_min']: continue
            if avg_dollar < CONF['prefilters']['avg_dollar_vol_min']: continue
            if apct < CONF['prefilters']['atr_pct_min']: continue
            kept.append({
                "symbol": sym,
                "price": price,
                "adv": adv,
                "avg_dollar_vol": avg_dollar,
                "atr_pct": apct
            })
        except Exception:
            continue
        if (i+1)%500==0: print(f"…scanned {i+1}, kept {len(kept)}")
    # rank by liquidity (avg $ volume), then price momentum (last/prev)
    kept.sort(key=lambda x: (x['avg_dollar_vol'], x['adv']), reverse=True)
    top = kept[:max_symbols]
    OUTF.write_text(json.dumps({
        "generated_at": dt.datetime.utcnow().isoformat()+"Z",
        "count": len(top),
        "symbols": [x["symbol"] for x in top],
        "metrics": top
    }, indent=2))
    print(f"Wrote {len(top)} symbols → {OUTF}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=400)
    ap.add_argument("--price-min", type=float, default=CONF['prefilters']['price_min'])
    ap.add_argument("--price-max", type=float, default=CONF['prefilters']['price_max'])
    a = ap.parse_args()
    main(a.max, a.price_min, a.price_max)