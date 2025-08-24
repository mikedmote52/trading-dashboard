"""
Alpha Provider Functions for Market Data
Includes Polygon API wrappers for full universe screening
"""

import os
import requests
import time
from typing import List, Dict, Optional
from collections import defaultdict

POLYGON = os.getenv("POLYGON_API_KEY")

# metrics counters (module-level)
METRICS = defaultdict(int)

def polygon_get(url, params=None):
    """Polygon API GET with HTTP traces and metrics"""
    import os, requests
    key = (os.getenv("POLYGON_API_KEY") or "").strip()
    headers = {"X-Polygon-API-Key": key} if key else {}
    if "Authorization" in headers: headers.pop("Authorization", None)  # belt
    print(f"[http-trace:polygon] GET {url} params={params or {}} keyLen={len(key)} tail={key[-4:] if key else ''}")
    r = requests.get(url, headers=headers, params=params, timeout=10)
    print(f"[http-resp:polygon] status={r.status_code} body[:120]={r.text[:120].replace(chr(10),' ')}")
    METRICS[f"polygon_http_{r.status_code}"] += 1
    r.raise_for_status()
    return r.json()

def _get(url, params=None):
    """Safe GET request with error handling (backward compatibility)"""
    try:
        return polygon_get(url, params)
    except Exception as e:
        METRICS["polygon_live_fail"] += 1
        print(f"[universe] live fetch failed: {e}; falling back immediately")
        return {}

def list_tickers(limit=1000, exchanges=("XNYS","XNAS","XASE")):
    """
    Return active US common stocks (no ETFs/ETNs/warrants/rights/OTC).
    Uses Polygon v3 reference tickers with pagination.
    """
    if not POLYGON:
        return []
    out = []
    url = "https://api.polygon.io/v3/reference/tickers"
    params = {
        "market": "stocks", "active": "true", "limit": 1000, "apiKey": POLYGON
    }
    next_url = url
    while next_url:
        j = _get(next_url, params)
        results = (j or {}).get("results", [])
        for r in results:
            # filters
            if r.get("primary_exchange") not in exchanges: 
                continue
            ttype = (r.get("type") or "").upper()
            if ttype in ("ETF","ETN","FUND","RIGHT","WARRANT","ADRC","ADRR"):
                continue
            if r.get("locale") != "us":
                continue
            if r.get("currency_name") != "usd":
                continue
            if r.get("ticker", "").startswith("OTC:") or r.get("cik") == "OTC":
                continue
            out.append(r["ticker"])
        next_url = (j or {}).get("next_url")
        params = {"apiKey": POLYGON} if next_url else None
    # de-dup
    return sorted(list(dict.fromkeys(out)))

def grouped_daily(date_iso, include_otc=False):
    """
    Polygon grouped daily for all US stocks on a specific date (YYYY-MM-DD).
    Returns list of {T, o,h,l,c,v} items; handles include_otc flag.
    """
    if not POLYGON:
        return []
    base = f"https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/{date_iso}"
    return _get(base, {"adjusted":"true","include_otc": str(include_otc).lower(), "apiKey": POLYGON}).get("results", [])

def daily_bars(symbol, days=30):
    """Get daily bars from Polygon API (existing function)"""
    if not POLYGON:
        return None
    
    try:
        import datetime as dt
        # Get recent daily data (wider range to handle weekends)
        today = dt.datetime.now().date()
        start_date = today - dt.timedelta(days=days + 15)
        
        url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{today}"
        params = {"apikey": POLYGON}
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data.get("status") == "OK" and data.get("results"):
            bars = data["results"]
            # Sort by timestamp and take most recent
            bars.sort(key=lambda x: x['t'], reverse=True)
            return bars[:days]
            
    except Exception as e:
        print(f"Daily bars error for {symbol}: {e}")
        
    return None

def minute_bars(symbol):
    """Get minute bars (optional, never fail if missing)"""
    if not POLYGON:
        return None
    
    try:
        import datetime as dt
        today = dt.datetime.now().date()
        url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/minute/{today}/{today}"
        params = {"apikey": POLYGON}
        
        response = requests.get(url, params=params, timeout=5)
        data = response.json()
        
        if data.get("status") == "OK" and data.get("results"):
            return data["results"]
            
    except Exception as e:
        # Don't log minute bar failures - they're optional
        pass
        
    return None

def short_metrics(symbol):
    """Get short interest and borrow fee data (placeholder for now)"""
    # This would connect to your existing short interest data sources
    # For now, return None to indicate no data available
    return None

def get_metrics():
    """Export metrics for monitoring"""
    return dict(METRICS)

def print_metrics():
    """Print metrics in standard format for log parsing"""
    print("[metrics]", dict(METRICS))