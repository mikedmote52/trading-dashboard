import pandas as pd
import numpy as np

def ema(series, span):
    """Calculate Exponential Moving Average"""
    return series.ewm(span=span, adjust=False).mean()

def rsi(series, period=14):
    """Calculate Relative Strength Index"""
    delta = series.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    rs = up.rolling(period).mean() / down.rolling(period).mean()
    return 100 - (100 / (1 + rs))

def atr(high, low, close, period=14):
    """Calculate Average True Range"""
    hl = (high - low).abs()
    hc = (high - close.shift()).abs()
    lc = (low - close.shift()).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def vwap(df):
    """Calculate Volume Weighted Average Price
    df: DataFrame with columns [t, o, h, l, c, v]
    """
    if df.empty or 'c' not in df.columns or 'v' not in df.columns:
        return pd.Series(dtype=float)
    
    pv = (df['c'] * df['v']).cumsum()
    vv = df['v'].cumsum()
    return pv / vv

def bollinger_bands(series, period=20, std_dev=2):
    """Calculate Bollinger Bands"""
    sma = series.rolling(period).mean()
    std = series.rolling(period).std()
    upper = sma + (std * std_dev)
    lower = sma - (std * std_dev)
    return upper, sma, lower

def macd(series, fast=12, slow=26, signal=9):
    """Calculate MACD"""
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

def stochastic(high, low, close, k_period=14, d_period=3):
    """Calculate Stochastic Oscillator"""
    lowest_low = low.rolling(k_period).min()
    highest_high = high.rolling(k_period).max()
    k_percent = 100 * ((close - lowest_low) / (highest_high - lowest_low))
    d_percent = k_percent.rolling(d_period).mean()
    return k_percent, d_percent