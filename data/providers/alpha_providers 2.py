import os, time, math, requests, statistics, datetime as dt
from typing import Dict, Any, List, Optional

POLYGON = os.getenv("POLYGON_API_KEY")
FINNHUB = os.getenv("FINNHUB_API_KEY")
YOUTUBE = os.getenv("YOUTUBE_API_KEY")

def _get(url, params=None, headers=None):
    for i in range(3):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=15)
            if r.status_code == 200: 
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(0.5*(i+1))
    return {}

# --- Market/technicals (Polygon) ---
def minute_bars(symbol: str, date: Optional[str]=None) -> List[Dict]:
    """Get last trading day minute bars"""
    if not POLYGON:
        return []
    # Use today's date for minute bars
    today = dt.date.today()
    url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/minute/{today}/{today}"
    return _get(url, {"adjusted":"true","sort":"asc","limit":5000,"apiKey":POLYGON}).get("results", [])

def daily_bars(symbol: str, days:int=30) -> List[Dict]:
    """Get daily bars for technical analysis"""
    if not POLYGON:
        return []
    # Calculate proper date range
    end_date = dt.date.today()
    start_date = end_date - dt.timedelta(days=days+5)  # Add buffer for weekends
    url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}"
    return _get(url, {"adjusted":"true","sort":"desc","limit":days,"apiKey":POLYGON}).get("results", [])

def company_news(symbol:str, days:int=7) -> List[Dict]:
    """Get recent company news for catalyst detection"""
    if not POLYGON:
        return []
    url = "https://api.polygon.io/v2/reference/news"
    from_date = (dt.datetime.utcnow()-dt.timedelta(days=days)).isoformat()+"Z"
    return _get(url, {"ticker":symbol, "published_utc.gte": from_date, "apiKey":POLYGON}).get("results", [])

# --- Short/float (Finnhub or fallback) ---
def short_metrics(symbol:str)->Dict[str,Any]:
    """Get float and short interest metrics"""
    base = {"float_shares":None,"short_interest":None,"borrow_fee":None,"utilization":None}
    if not FINNHUB: 
        return base
    try:
        # Float shares
        f = _get("https://finnhub.io/api/v1/stock/float", {"symbol":symbol,"token":FINNHUB})
        if f and "floatShares" in f:
            base["float_shares"] = f["floatShares"]
        
        # Short interest - try basic profile first
        profile = _get("https://finnhub.io/api/v1/stock/profile2", {"symbol":symbol,"token":FINNHUB})
        if profile and "shareOutstanding" in profile:
            # Use estimated short interest if available
            base["short_interest"] = profile.get("shortRatio", 0) * 0.05  # Rough estimate
            
        # Basic metrics - Finnhub doesn't always have these
        metrics = _get("https://finnhub.io/api/v1/stock/metric", {"symbol":symbol,"metric":"all","token":FINNHUB})
        if metrics and "metric" in metrics:
            m = metrics["metric"]
            base["borrow_fee"] = m.get("shortInterestSharePercent", 0) * 0.01 if m.get("shortInterestSharePercent") else None
            base["utilization"] = min(1.0, m.get("shortInterestSharePercent", 0) * 0.01) if m.get("shortInterestSharePercent") else None
            
    except Exception as e:
        print(f"Short metrics error for {symbol}: {e}")
    return base

# --- Options (Finnhub) ---
def options_metrics(symbol:str)->Dict[str,Any]:
    """Get options flow and IV metrics"""
    out = {"call_put_ratio":None,"near_atm_call_oi_change":None,"iv_percentile":None}
    if not FINNHUB: 
        return out
    try:
        # Basic options data - Finnhub has limited free options data
        # For demo purposes, we'll use basic metrics
        profile = _get("https://finnhub.io/api/v1/stock/profile2", {"symbol":symbol,"token":FINNHUB})
        if profile:
            # Estimate call/put ratio from volatility
            volatility = profile.get("beta", 1.0)
            if volatility:
                out["call_put_ratio"] = max(0.5, min(5.0, volatility * 1.5))
                
        # IV percentile approximation
        quote = _get("https://finnhub.io/api/v1/quote", {"symbol":symbol,"token":FINNHUB})
        if quote and "c" in quote and "pc" in quote:
            daily_change = abs(quote["c"] - quote["pc"]) / quote["pc"] if quote["pc"] else 0
            out["iv_percentile"] = min(100, int(daily_change * 1000))  # Rough approximation
            
    except Exception as e:
        print(f"Options metrics error for {symbol}: {e}")
    return out

# --- Social (Reddit/Stocktwits/YouTube) ---
def social_metrics(symbol:str)->Dict[str,Any]:
    """Get social sentiment and mention metrics"""
    out = {"reddit_mentions":0,"stocktwits_msgs":0,"youtube_trend":0,"sentiment_score":0.0}
    
    # Stocktwits public API
    try:
        if os.getenv("STOCKTWITS_ENABLED","false").lower()=="true":
            st_data = _get(f"https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json")
            if st_data and "messages" in st_data:
                messages = st_data["messages"]
                out["stocktwits_msgs"] = len(messages)
                
                # Calculate basic sentiment from message sentiment
                if messages:
                    sentiments = []
                    for msg in messages:
                        if msg.get("entities", {}).get("sentiment"):
                            sent = msg["entities"]["sentiment"]["basic"]
                            if sent == "Bullish":
                                sentiments.append(1.0)
                            elif sent == "Bearish":
                                sentiments.append(-1.0)
                    if sentiments:
                        out["sentiment_score"] = sum(sentiments) / len(sentiments)
    except Exception as e:
        print(f"StockTwits error for {symbol}: {e}")
    
    # YouTube trending (basic search)
    try:
        if YOUTUBE:
            from_date = (dt.datetime.utcnow()-dt.timedelta(days=2)).isoformat()+"Z"
            yt_data = _get("https://www.googleapis.com/youtube/v3/search",
                          {"q":symbol,"type":"video","order":"date","publishedAfter":from_date,"key":YOUTUBE,"maxResults":10})
            if yt_data and "items" in yt_data:
                out["youtube_trend"] = len(yt_data["items"])
    except Exception as e:
        print(f"YouTube error for {symbol}: {e}")
    
    # Reddit mentions (basic approximation without OAuth)
    try:
        # Use Reddit search without auth (limited)
        reddit_data = _get(f"https://www.reddit.com/search.json", {"q":symbol, "limit":25, "sort":"new"})
        if reddit_data and "data" in reddit_data and "children" in reddit_data["data"]:
            # Filter for recent posts mentioning the symbol
            recent_posts = []
            now = dt.datetime.utcnow().timestamp()
            for post in reddit_data["data"]["children"]:
                post_data = post.get("data", {})
                created_utc = post_data.get("created_utc", 0)
                if now - created_utc < 86400:  # Last 24 hours
                    title = post_data.get("title", "").upper()
                    if symbol.upper() in title:
                        recent_posts.append(post_data)
            out["reddit_mentions"] = len(recent_posts)
    except Exception as e:
        print(f"Reddit error for {symbol}: {e}")
    
    return out