import math

def bucketize(score: int, th_watch: int, th_trade: int):
    """Categorize stock based on score thresholds"""
    return "trade-ready" if score >= th_trade else ("watch" if score >= th_watch else "drop")

def composite_score(parts, w):
    """
    Calculate composite score from component scores
    
    parts: dict with keys [volume_momentum, float_short, catalysts, sentiment, options, technicals] each 0..100
    w: weights dict
    returns int 0..100
    """
    if not parts or not w:
        return 0
        
    score = (
        parts.get("volume_momentum", 0) * w.get("volume_momentum", 0) +
        parts.get("float_short", 0) * w.get("float_short", 0) +
        parts.get("catalysts", 0) * w.get("catalysts", 0) +
        parts.get("sentiment", 0) * w.get("sentiment", 0) +
        parts.get("options", 0) * w.get("options", 0) +
        parts.get("technicals", 0) * w.get("technicals", 0)
    )
    
    return max(0, min(100, int(round(score))))

def normalize_score(value, min_val, max_val, target_min=0, target_max=100):
    """Normalize a value to a 0-100 scale"""
    if max_val == min_val:
        return target_min
    
    normalized = (value - min_val) / (max_val - min_val)
    return target_min + normalized * (target_max - target_min)

def calculate_entry_targets(price, score, volatility=None):
    """Calculate entry, stop loss, and target prices based on score and volatility"""
    if not price or price <= 0:
        return {}
    
    # Base percentages based on score
    if score >= 85:
        stop_pct = 0.08  # 8% stop
        target1_pct = 0.25  # 25% target
        target2_pct = 0.50  # 50% target
    elif score >= 75:
        stop_pct = 0.10  # 10% stop
        target1_pct = 0.20  # 20% target
        target2_pct = 0.40  # 40% target
    elif score >= 70:
        stop_pct = 0.12  # 12% stop
        target1_pct = 0.15  # 15% target
        target2_pct = 0.30  # 30% target
    else:
        stop_pct = 0.15  # 15% stop
        target1_pct = 0.10  # 10% target
        target2_pct = 0.20  # 20% target
    
    # Adjust for volatility if provided
    if volatility:
        vol_multiplier = max(0.5, min(2.0, volatility / 0.3))  # Normalize around 30% volatility
        stop_pct *= vol_multiplier
        target1_pct *= vol_multiplier
        target2_pct *= vol_multiplier
    
    return {
        "entry": round(price * 0.98, 2),  # Enter 2% below current price
        "stop_loss": round(price * (1 - stop_pct), 2),
        "target_1": round(price * (1 + target1_pct), 2),
        "target_2": round(price * (1 + target2_pct), 2),
        "risk_reward_ratio": round(target1_pct / stop_pct, 2)
    }

def risk_score(short_interest, borrow_fee, utilization, float_shares):
    """Calculate risk score based on short squeeze metrics"""
    risk = 0
    
    # Short interest contribution (0-40 points)
    if short_interest:
        if short_interest >= 0.30:  # 30%+
            risk += 40
        elif short_interest >= 0.20:  # 20-30%
            risk += 30
        elif short_interest >= 0.10:  # 10-20%
            risk += 20
        else:
            risk += 10
    
    # Borrow fee contribution (0-30 points)
    if borrow_fee:
        if borrow_fee >= 0.50:  # 50%+
            risk += 30
        elif borrow_fee >= 0.30:  # 30-50%
            risk += 25
        elif borrow_fee >= 0.20:  # 20-30%
            risk += 20
        elif borrow_fee >= 0.10:  # 10-20%
            risk += 15
        else:
            risk += 5
    
    # Utilization contribution (0-20 points)
    if utilization:
        if utilization >= 0.90:  # 90%+
            risk += 20
        elif utilization >= 0.80:  # 80-90%
            risk += 15
        elif utilization >= 0.70:  # 70-80%
            risk += 10
        else:
            risk += 5
    
    # Float size penalty (0-10 points)
    if float_shares:
        if float_shares <= 10_000_000:  # <10M
            risk += 10
        elif float_shares <= 50_000_000:  # 10-50M
            risk += 5
        # No penalty for larger floats
    
    return min(100, risk)