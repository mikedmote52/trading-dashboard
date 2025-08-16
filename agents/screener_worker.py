import os, json, sqlite3, datetime as dt, sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

from utils.alpha_ta import ema, rsi, atr, vwap
from utils.alpha_scoring import composite_score, bucketize, calculate_entry_targets
from data.providers.alpha_providers import minute_bars, daily_bars, company_news, short_metrics, options_metrics, social_metrics
import pandas as pd
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "trading_dashboard.db"
CACHE_DIR = ROOT / "data" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

try:
    with open(ROOT / "config" / "alpha_scoring.yml", 'r') as f:
        CONF = yaml.safe_load(f)
except FileNotFoundError:
    print("Warning: alpha_scoring.yml not found, using defaults")
    CONF = {
        "weights": {
            "volume_momentum": 0.25,
            "float_short": 0.20,
            "catalysts": 0.20,
            "sentiment": 0.15,
            "options": 0.10,
            "technicals": 0.10
        },
        "thresholds": {
            "rel_vol_30m": 3.0,
            "score_watch": 70,
            "score_trade_ready": 75
        }
    }

def _daily_df(d):
    """Convert daily bars data to DataFrame"""
    return pd.DataFrame(d)[['o','h','l','c','v']].rename(columns=str.lower, inplace=False)

def _pct(arr, p):
    return float(np.nanpercentile(np.array(arr, dtype=float), p)) if len(arr) else float('nan')

def prefilter_symbols(symbols):
    """
    Adaptive, cheap prefilter:
      - Computes daily metrics for candidates (price, ADV, avg $ volume, ATR%, 5D ret, day range%)
      - Applies percentile-based thresholds that auto-relax until we keep at least min_keep
      - Also admits 'momentum lane' names (5D ret or day-range hot) even if liquidity is modest
      - Returns top 'target_keep' ranked by cheap quality score
    """
    pf = CONF['prefilters']
    strat = CONF.get('prefilter_strategy', {})
    lane = CONF.get('momentum_lane', {})

    print(f"🔍 Adaptive prefiltering {len(symbols)} symbols...")
    rows = []
    for sym in symbols:
        try:
            d = daily_bars(sym, 30)
            if not d: 
                continue
            df = _daily_df(d)
            if df.empty or len(df) < 6:
                continue
            # newest first from Polygon helper
            c_now = float(df['c'].iloc[0])
            c_prev = float(df['c'].iloc[1]) if df['c'].iloc[1] else c_now
            price_ok = pf['price_min'] <= c_now <= pf['price_max']
            if not price_ok:
                continue

            # liquidity
            adv = float(df['v'].mean())
            avg_dollar = float((df['c'] * df['v']).mean())

            # ATR%
            from utils.alpha_ta import atr
            atr_val = atr(df['h'], df['l'], df['c'], 14)
            atr_pct = float(atr_val.iloc[-1] / (df['c'].iloc[-1] or 1)) if not atr_val.empty else 0.0

            # momentum lane cheap signals (dailies only)
            c_5 = float(df['c'].iloc[5]) if len(df) > 5 else c_now
            ret_5d = (c_now / c_5 - 1.0) if c_5 > 0 else 0.0
            day_range = float((df['h'].iloc[0] - df['l'].iloc[0]) / (df['c'].iloc[0] or 1))

            rows.append({
                'symbol': sym,
                'price': c_now,
                'adv': adv,
                'avg_dollar': avg_dollar,
                'atr_pct': atr_pct,
                'ret_5d': ret_5d,
                'day_range': day_range,
            })
        except Exception as e:
            print(f"⚠️ Error prefiltering {sym}: {e}")
            continue

    if not rows:
        print("🎯 No valid symbols for prefiltering")
        return []

    # Compute percentiles over the pool
    advs = [r['adv'] for r in rows]
    dollars = [r['avg_dollar'] for r in rows]
    atrs = [r['atr_pct'] for r in rows]

    adv_pct = strat.get('adv_pct_min', 40)
    dol_pct = strat.get('dollar_pct_min', 40)
    atrp_pct = strat.get('atr_pct_min', 60)
    step = strat.get('step_percentile', 5)
    min_keep = strat.get('min_keep', 120)
    target_keep = strat.get('target_keep', 200)

    survivors = []
    while True:
        adv_thr = _pct(advs, adv_pct)
        dol_thr = _pct(dollars, dol_pct)
        atr_thr = _pct(atrs, atrp_pct)

        base = [r for r in rows
                if r['adv'] >= adv_thr
                and r['avg_dollar'] >= dol_thr
                and r['atr_pct'] >= atr_thr]

        # Momentum lane (OR condition): admit if 'hot' on cheap signals
        hot = [r for r in rows
               if (r['ret_5d'] >= lane.get('ret_5d_min', 0.15))
               or (r['day_range'] >= lane.get('day_range_min', 0.08))]

        # Merge & de-dup
        m = {r['symbol']: r for r in base + hot}
        survivors = list(m.values())

        if len(survivors) >= min_keep or (adv_pct <= 10 and dol_pct <= 10 and atrp_pct <= 20):
            break

        # Relax thresholds
        adv_pct = max(10, adv_pct - step)
        dol_pct = max(10, dol_pct - step)
        atrp_pct = max(20, atrp_pct - step)

    # Rank by cheap quality score (liquidity + volatility + short-term return)
    def qscore(r):
        return (
            0.5 * (r['avg_dollar']) +
            0.3 * (r['atr_pct']) +
            0.2 * (r['ret_5d'])
        )
    survivors.sort(key=qscore, reverse=True)
    kept = survivors[:target_keep]
    print(f"🎯 Prefilter kept {len(kept)} (target {target_keep}); relaxed to adv%={adv_pct}, $vol%={dol_pct}, atr%={atrp_pct}")
    return [r['symbol'] for r in kept]

def monthly_momentum_checks(df):
    """Check for monthly momentum signals"""
    try:
        # df: daily OHLCV newest first
        look = CONF['monthly']['breakout_lookback']
        buf  = CONF['monthly']['breakout_buffer']
        c_now = float(df['c'].iloc[0])
        c_21  = float(df['c'].iloc[min(21, len(df)-1)]) if len(df) > 21 else c_now
        
        # 21-day return
        ret_21d = (c_now / c_21 - 1.0) if c_21 > 0 else 0.0
        
        # 20-day breakout
        hh = float(df['c'].iloc[1:look+1].max()) if len(df) > look+1 else float('nan')
        breakout = (not pd.isna(hh)) and (c_now >= hh * (1.0 + buf))
        
        # 3 of 4 up days
        up_days = int((df['c'].iloc[0:4].diff().fillna(0) > 0).sum()) if len(df) >= 4 else 0
        
        return {
            'ret_21d': ret_21d,
            'breakout20': bool(breakout),
            'up_days_3of4': up_days >= CONF['monthly']['up_days_min']
        }
    except Exception as e:
        print(f"Error in monthly_momentum_checks: {e}")
        return {'ret_21d': 0.0, 'breakout20': False, 'up_days_3of4': False}

def rel_vol_30m(mins, daily30):
    """Calculate relative volume for last 30 minutes"""
    if not mins or not daily30:
        return 0.0
        
    try:
        df = pd.DataFrame(mins)
        if df.empty or 'v' not in df.columns:
            return 0.0
            
        # Get last 30 minutes of volume
        last30_vol = df.tail(30)['v'].sum()
        
        # Calculate average daily volume
        avg_day_vol = sum([d.get('v', 0) for d in daily30]) / len(daily30) if daily30 else 0
        
        # Average volume per minute (assuming 6.5 hour trading day)
        avg_min_vol = avg_day_vol / (6.5 * 60) if avg_day_vol > 0 else 0
        
        # Relative volume ratio
        return (last30_vol / (avg_min_vol * 30)) if avg_min_vol > 0 else 0.0
        
    except Exception as e:
        print(f"Error calculating rel_vol_30m: {e}")
        return 0.0

def compute_technicals(symbol):
    """Compute technical indicators for a symbol"""
    try:
        mins = minute_bars(symbol)
        dailies = daily_bars(symbol, 30)
        
        # Fallback when minute bars are missing
        if (not mins) and dailies:
            d_df = pd.DataFrame(dailies).rename(columns=str.lower, inplace=False)
            if d_df.empty:
                return {}
            tech = {}
            tech['price'] = float(d_df['c'].iloc[0])
            tech['ema9']  = float(ema(d_df['c'], 9).iloc[0]) if len(d_df) >= 9 else tech['price']
            tech['ema20'] = float(ema(d_df['c'], 20).iloc[0]) if len(d_df) >= 20 else tech['price']
            tech['rsi']   = float(rsi(d_df['c'], 14).iloc[0]) if len(d_df) >= 14 else 50.0
            # ATR% from dailies
            atr_val = atr(d_df['h'], d_df['l'], d_df['c'], 14)
            tech['atr_frac'] = float(atr_val.iloc[0] / d_df['c'].iloc[0]) if not atr_val.empty and d_df['c'].iloc[0] > 0 else 0.0
            # No minute VWAP/RelVol; set safe defaults so we don't block
            tech['vwap'] = tech['price']  # Use current price as VWAP fallback
            tech['rel_vol_30m'] = 2.0  # Set moderate default to pass early gate
            tech['multi_day_up'] = bool(d_df['c'].pct_change().head(4).dropna().gt(0).sum() >= 3) if len(d_df) >= 4 else False
            tech['above_vwap'] = True  # Assume above when using price as VWAP
            tech['ema_bull_cross'] = tech['ema9'] >= tech['ema20']
            print(f"  {symbol} using daily fallback (no minute data)")
            return tech
        
        if not mins or not dailies:
            return {}
            
        # Process minute data
        m_df = pd.DataFrame(mins)
        if m_df.empty:
            return {}
            
        # Ensure required columns exist
        required_cols = ['t', 'o', 'h', 'l', 'c', 'v']
        if not all(col in m_df.columns for col in required_cols):
            return {}
            
        # Convert timestamp and set as index
        m_df['t'] = pd.to_datetime(m_df['t'], unit='ms')
        m_df = m_df.rename(columns={col: col.lower() for col in m_df.columns})
        m_df = m_df.set_index('t')
        
        # Calculate technical indicators
        tech = {}
        
        # VWAP
        tech['vwap'] = float(vwap(m_df).iloc[-1]) if not vwap(m_df).empty else 0.0
        
        # EMAs
        tech['ema9'] = float(ema(m_df['c'], 9).iloc[-1]) if len(m_df) >= 9 else 0.0
        tech['ema20'] = float(ema(m_df['c'], 20).iloc[-1]) if len(m_df) >= 20 else 0.0
        
        # RSI
        tech['rsi'] = float(rsi(m_df['c'], 14).iloc[-1]) if len(m_df) >= 14 else 50.0
        
        # Current price
        tech['price'] = float(m_df['c'].iloc[-1])
        
        # Process daily data for ATR
        d_df = pd.DataFrame(dailies)
        if not d_df.empty and all(col in d_df.columns for col in ['o', 'h', 'l', 'c', 'v']):
            d_df = d_df.rename(columns={col: col.lower() for col in d_df.columns})
            atr_val = atr(d_df['h'], d_df['l'], d_df['c'], 14)
            tech['atr_frac'] = float(atr_val.iloc[-1] / d_df['c'].iloc[-1]) if not atr_val.empty and d_df['c'].iloc[-1] > 0 else 0.0
            
            # Multi-day momentum
            daily_returns = d_df['c'].pct_change().tail(4).dropna()
            tech['multi_day_up'] = bool(daily_returns.gt(0).sum() >= 3)
        else:
            tech['atr_frac'] = 0.0
            tech['multi_day_up'] = False
        
        # Relative volume
        tech['rel_vol_30m'] = float(rel_vol_30m(mins, dailies))
        
        # Technical conditions
        tech['above_vwap'] = tech['price'] >= tech['vwap'] if tech['vwap'] > 0 else False
        tech['ema_bull_cross'] = tech['ema9'] >= tech['ema20'] if tech['ema9'] > 0 and tech['ema20'] > 0 else False
        
        return tech
        
    except Exception as e:
        print(f"Error computing technicals for {symbol}: {e}")
        return {}

def catalyst_strength(symbol):
    """Analyze news for catalyst strength"""
    try:
        news = company_news(symbol, 7) or []
        hits = []
        score = 0
        
        for article in news:
            headline = (article.get("title", "") + " " + article.get("description", "")).lower()
            url = article.get("article_url", "")
            title = article.get("title", "")
            
            # Earnings catalysts
            if any(keyword in headline for keyword in ["earnings", "guidance", "revenue", "beat", "eps"]):
                score += 30
                hits.append(("earnings", title, url))
            
            # FDA/biotech catalysts
            if any(keyword in headline for keyword in ["fda", "phase", "trial", "approval", "drug"]):
                score += 35
                hits.append(("fda", title, url))
            
            # Insider activity
            if any(keyword in headline for keyword in ["insider", "form 4", "purchases", "buys shares"]):
                score += 20
                hits.append(("insider", title, url))
            
            # M&A activity
            if any(keyword in headline for keyword in ["acquire", "merger", "m&a", "takeover", "buyout"]):
                score += 35
                hits.append(("mna", title, url))
            
            # Contract/partnership news
            if any(keyword in headline for keyword in ["contract", "partnership", "deal", "agreement"]):
                score += 15
                hits.append(("contract", title, url))
        
        return min(100, score), hits
        
    except Exception as e:
        print(f"Error analyzing catalysts for {symbol}: {e}")
        return 0, []

def part_scores(symbol, tech, shorts, opts, social):
    """Calculate component scores for the composite score"""
    try:
        w = CONF["weights"]
        th = CONF["thresholds"]
        
        # Volume & momentum (0-100 points)
        vol = 0
        if tech.get("rel_vol_30m", 0) >= th.get("rel_vol_30m", 3.0):
            vol += 60
        if tech.get("multi_day_up", False):
            vol += 20
        if tech.get("above_vwap", False):
            vol += 20
            
        # Monthly momentum boosts
        if tech.get('ret_21d', 0) >= CONF['monthly']['ret_21d_min']:
            vol += 20
        if tech.get('breakout20', False):
            vol += 15
        if tech.get('up_days_3of4', False):
            vol += 10
        
        vol = min(100, vol)
        
        # Float & short squeeze potential (0-100 points)
        fs = 0
        float_shares = shorts.get("float_shares")
        if float_shares:
            if float_shares <= th.get("float_max_low", 50_000_000):
                fs += 60
            elif (float_shares >= th.get("alt_float_min_high", 150_000_000) and 
                  (shorts.get("short_interest", 0) >= th.get("short_interest_min", 0.20))):
                fs += 40
        
        if (shorts.get("borrow_fee", 0) >= th.get("borrow_fee_min", 0.20)):
            fs += 20
        if (shorts.get("utilization", 0) >= th.get("utilization_min", 0.85)):
            fs += 20
        
        # Sentiment (0-100 points)
        sent = 0
        if social.get("stocktwits_msgs", 0) > 50 or social.get("reddit_mentions", 0) > 20:
            sent += 40
        sent += min(60, int((social.get("youtube_trend", 0)) * 4))
        
        # Add sentiment score bonus
        sentiment_score = social.get("sentiment_score", 0)
        if sentiment_score > 0.5:
            sent += 20
        elif sentiment_score > 0.2:
            sent += 10
        
        # Options (0-100 points)
        opt = 0
        if (opts.get("call_put_ratio", 0) >= th.get("call_put_min", 2.0)):
            opt += 60
        if (opts.get("near_atm_call_oi_change", 0) > 0):
            opt += 20
        if (opts.get("iv_percentile", 0) >= th.get("iv_percentile_min", 80)):
            opt += 20
        
        # Technicals (0-100 points)
        t = 0
        if tech.get("ema_bull_cross", False):
            t += 30
        
        rsi_val = tech.get("rsi", 50)
        rsi_min = th.get("rsi_min", 60)
        rsi_max = th.get("rsi_max", 70)
        if rsi_min <= rsi_val <= rsi_max:
            t += 40
        
        if tech.get("atr_frac", 0) >= th.get("atr_frac_min", 0.04):
            t += 30
        
        # Catalysts
        cat_score, _ = catalyst_strength(symbol)
        
        return {
            "volume_momentum": min(100, vol),
            "float_short": min(100, fs),
            "catalysts": min(100, cat_score),
            "sentiment": min(100, sent),
            "options": min(100, opt),
            "technicals": min(100, t)
        }
        
    except Exception as e:
        print(f"Error calculating part scores for {symbol}: {e}")
        return {
            "volume_momentum": 0,
            "float_short": 0,
            "catalysts": 0,
            "sentiment": 0,
            "options": 0,
            "technicals": 0
        }

def scan_symbols(symbols, run_label):
    """Main scanning function"""
    try:
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        results = []
        
        print(f"Starting scan of {len(symbols)} symbols for run: {run_label}")
        
        # PREFILTER STEP: Reduce universe by 80-90% with cheap checks
        symbols = prefilter_symbols(symbols)
        
        # If prefilter left a tiny list, relax the early intraday RelVol gate later
        early_relvol_min = CONF['intraday_gates']['early_relvol_min']
        relax_cfg = CONF.get('intraday_relax', {})
        if len(symbols) < relax_cfg.get('relax_if_under', 60):
            print("⚠️ Low prefilter survivors; auto-relaxing early RelVol gate.")
            early_relvol_min = relax_cfg.get('early_relvol_relaxed', early_relvol_min)
        
        # Optional: keep only top movers by daily change (cheap ranking)
        ranked = []
        for sym in symbols:
            try:
                d = daily_bars(sym, 2)
                if not d: 
                    continue
                df = _daily_df(d)
                if len(df) < 2:
                    continue
                day_chg = float((df['c'].iloc[0] / df['c'].iloc[1] - 1.0) if df['c'].iloc[1] else 0)
                ranked.append((sym, day_chg))
            except:
                continue
                
        # Take top 200 daily movers
        symbols = [s for s,_ in sorted(ranked, key=lambda x: x[1], reverse=True)[:200]]
        print(f"🚀 Top 200 daily movers selected: {symbols[:10]}..." if len(symbols) > 10 else f"🚀 Daily movers: {symbols}")
        
        for i, sym in enumerate(symbols):
            try:
                print(f"Processing {sym} ({i+1}/{len(symbols)})...")
                
                # Get technical data
                tech = compute_technicals(sym)
                if not tech:
                    print(f"  No technical data for {sym}, skipping")
                    continue
                
                # MONTHLY MOMENTUM CHECK: Filter for monthly movers before expensive calls
                dailies = daily_bars(sym, 30)
                if dailies:
                    d_df = _daily_df(dailies)
                    momo = monthly_momentum_checks(d_df)
                    
                    # Must pass at least one monthly momentum criteria
                    if not (momo['ret_21d'] >= CONF['monthly']['ret_21d_min'] or 
                           momo['breakout20'] or 
                           momo['up_days_3of4']):
                        print(f"  {sym} failed monthly momentum check, skipping")
                        continue
                    
                    # Add monthly signals to tech data for scoring
                    tech.update(momo)
                    print(f"  {sym} monthly momentum: 21d={momo['ret_21d']:.1%}, breakout={momo['breakout20']}, up_days={momo['up_days_3of4']}")
                
                # INTRADAY EARLY GATE: Check rel vol before expensive API calls
                # If minute data is thin/missing, don't kill the name here
                mins = minute_bars(sym)
                if tech.get('rel_vol_30m', 0) == 0 and not mins:
                    print(f"  {sym} minute bars unavailable; bypassing early RelVol gate")
                else:
                    if tech.get('rel_vol_30m', 0) < early_relvol_min:
                        print(f"  {sym} rel vol {tech.get('rel_vol_30m', 0):.1f}x below {early_relvol_min}x threshold")
                        continue
                
                # Get fundamental data
                shorts = short_metrics(sym)
                opts = options_metrics(sym)
                social = social_metrics(sym)
                
                # Calculate component scores
                parts = part_scores(sym, tech, shorts, opts, social)
                
                # Calculate composite score
                score = composite_score(parts, CONF["weights"])
                
                # Determine bucket
                bucket = bucketize(score, 
                                 CONF["thresholds"]["score_watch"], 
                                 CONF["thresholds"]["score_trade_ready"])
                
                if bucket == "drop":
                    print(f"  {sym} score {score} below threshold, dropping")
                    continue
                
                print(f"  {sym} scored {score} -> {bucket}")
                
                # Calculate entry targets
                price = tech.get("price", 0)
                targets = calculate_entry_targets(price, score, tech.get("atr_frac"))
                
                # Store in database
                c.execute("""
                    REPLACE INTO technical_metrics(
                        symbol, rsi, atr_frac, ema9, ema20, vwap, price, rel_vol_30m, multi_day_up
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sym, tech.get("rsi"), tech.get("atr_frac"), tech.get("ema9"), 
                    tech.get("ema20"), tech.get("vwap"), tech.get("price"), 
                    tech.get("rel_vol_30m"), int(tech.get("multi_day_up", False))
                ))
                
                c.execute("""
                    REPLACE INTO short_metrics(
                        symbol, float_shares, short_interest, borrow_fee, utilization
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    sym, shorts.get("float_shares"), shorts.get("short_interest"), 
                    shorts.get("borrow_fee"), shorts.get("utilization")
                ))
                
                c.execute("""
                    REPLACE INTO options_metrics(
                        symbol, call_put_ratio, near_atm_call_oi_change, iv_percentile
                    ) VALUES (?, ?, ?, ?)
                """, (
                    sym, opts.get("call_put_ratio"), opts.get("near_atm_call_oi_change"), 
                    opts.get("iv_percentile")
                ))
                
                c.execute("""
                    REPLACE INTO sentiment_metrics(
                        symbol, reddit_mentions, stocktwits_msgs, youtube_trend, sentiment_score
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    sym, social.get("reddit_mentions", 0), social.get("stocktwits_msgs", 0), 
                    social.get("youtube_trend", 0), social.get("sentiment_score", 0.0)
                ))
                
                c.execute("""
                    INSERT INTO screener_candidates(
                        symbol, score, bucket, reason, run_label
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    sym, score, bucket, json.dumps({
                        "parts": parts,
                        "targets": targets,
                        "technical_summary": {
                            "price": tech.get("price"),
                            "rsi": tech.get("rsi"),
                            "rel_vol": tech.get("rel_vol_30m"),
                            "above_vwap": tech.get("above_vwap"),
                            "ema_bull": tech.get("ema_bull_cross")
                        }
                    }), run_label
                ))
                
                conn.commit()
                
                # Add to results
                result = {
                    "symbol": sym,
                    "score": score,
                    "bucket": bucket,
                    "parts": parts,
                    "targets": targets,
                    "price": price,
                    "technical_summary": {
                        "rsi": tech.get("rsi"),
                        "rel_vol": tech.get("rel_vol_30m"),
                        "above_vwap": tech.get("above_vwap"),
                        "ema_bull": tech.get("ema_bull_cross")
                    }
                }
                results.append(result)
                
            except Exception as e:
                print(f"Error processing {sym}: {e}")
                continue
        
        # Sort by score and cache top results
        results.sort(key=lambda r: r["score"], reverse=True)
        top_results = results[:50]
        
        # Write to cache
        cache_file = CACHE_DIR / "candidates.json"
        with open(cache_file, 'w') as f:
            json.dump(top_results, f, indent=2, default=str)
        
        conn.close()
        
        print(f"Scan complete: {len(results)} candidates found, top {len(top_results)} cached")
        return results
        
    except Exception as e:
        print(f"Error in scan_symbols: {e}")
        return []

if __name__ == "__main__":
    # Symbol universe - use env var, dynamic universe, or fallback
    scan_symbols_env = os.getenv("SCAN_SYMBOLS")
    if scan_symbols_env:
        default_symbols = [s.strip() for s in scan_symbols_env.split(",") if s.strip()]
        print(f"Using SCAN_SYMBOLS env: {len(default_symbols)}")
    else:
        uni_path = ROOT / "data" / "universe.json"
        if uni_path.exists():
            j = json.loads(uni_path.read_text())
            default_symbols = j.get("symbols", [])[:400]
            print(f"Using data/universe.json: {len(default_symbols)} symbols")
        else:
            default_symbols = ["PLTR","RBLX","SOFI","UPST","AFRM","AEVA","CRDO","RGTI","QUBT","REKR"]
            print(f"No universe.json; using tiny fallback: {len(default_symbols)}")
    
    # Get run label from environment or use manual
    run_label = os.getenv("SCREENER_LABEL", "manual")
    
    print(f"AlphaStack Screener starting - Run label: {run_label}")
    
    # Scan symbols
    results = scan_symbols(default_symbols, run_label)
    
    if results:
        print(f"\nTop 10 candidates:")
        for i, result in enumerate(results[:10]):
            print(f"{i+1:2d}. {result['symbol']:6s} Score: {result['score']:3d} ({result['bucket']})")
    else:
        print("No candidates found")
