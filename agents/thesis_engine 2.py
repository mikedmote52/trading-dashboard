#!/usr/bin/env python3
"""
Thesis Engine - Generates structured investment theses for AlphaStack candidates
Implements learning loop with thesis events tracking
"""

import json
import sqlite3
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import requests
from dotenv import load_dotenv
import yaml

load_dotenv()

class ThesisEngine:
    def __init__(self, db_path: str = "trading_dashboard.db"):
        self.db_path = db_path
        self.polygon_api_key = os.getenv("POLYGON_API_KEY")
        
        # Load config
        config_path = os.path.join(os.path.dirname(__file__), "..", "config", "alpha_scoring.yml")
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
    
    def generate_thesis(self, symbol: str, market_data: Dict) -> Dict:
        """Generate structured thesis for a symbol"""
        
        # Get historical context
        historical_data = self._get_historical_context(symbol)
        short_data = self._get_short_interest_data(symbol)
        catalyst_data = self._check_catalyst_events(symbol)
        
        # Calculate thesis components
        why_now = self._analyze_why_now(symbol, market_data, historical_data, catalyst_data)
        risk_flags = self._identify_risk_flags(symbol, market_data, short_data)
        sources = self._compile_sources(symbol, market_data)
        
        # Generate confidence score
        confidence = self._calculate_confidence(market_data, historical_data, catalyst_data)
        
        thesis = {
            "symbol": symbol,
            "generated_at": datetime.now().isoformat(),
            "confidence": confidence,
            "recommendation": self._get_recommendation(confidence, market_data),
            "why_now": why_now,
            "risk_flags": risk_flags,
            "sources": sources,
            "market_data": market_data,
            "price_target": self._calculate_price_target(symbol, market_data, confidence),
            "time_horizon": self._estimate_time_horizon(catalyst_data, market_data)
        }
        
        # Store thesis and log event
        self._store_thesis(thesis)
        self._log_thesis_event(symbol, "thesis_generated", thesis)
        
        return thesis
    
    def _analyze_why_now(self, symbol: str, market_data: Dict, historical_data: Dict, catalyst_data: Dict) -> List[str]:
        """Analyze why this opportunity exists now"""
        reasons = []
        
        # Volume analysis
        if market_data.get("rel_volume", 0) > 2.0:
            reasons.append(f"Volume spike: {market_data['rel_volume']:.1f}x average")
        
        # Momentum analysis
        momentum = market_data.get("momentum_21d", 0)
        if momentum > 0.15:
            reasons.append(f"Strong monthly momentum: +{momentum*100:.1f}%")
        
        # Short squeeze potential
        short_interest = market_data.get("short_interest", 0)
        if short_interest > 0.20:
            borrow_fee = market_data.get("borrow_fee", 0)
            if borrow_fee > 0.10:
                reasons.append(f"Short squeeze setup: {short_interest*100:.1f}% SI, {borrow_fee*100:.1f}% borrow fee")
        
        # Technical breakout
        rsi = market_data.get("rsi", 50)
        if 50 < rsi < 70:
            reasons.append(f"Technical momentum: RSI {rsi:.1f} in bullish zone")
        
        # Catalyst events
        if catalyst_data.get("earnings_soon"):
            reasons.append("Earnings catalyst approaching")
        if catalyst_data.get("news_volume") > 5:
            reasons.append(f"Increased news flow: {catalyst_data['news_volume']} recent articles")
        
        return reasons
    
    def _identify_risk_flags(self, symbol: str, market_data: Dict, short_data: Dict) -> List[str]:
        """Identify potential risk factors"""
        risks = []
        
        # High volatility
        atr_pct = market_data.get("atr_frac", 0)
        if atr_pct > 0.08:
            risks.append(f"High volatility: {atr_pct*100:.1f}% ATR")
        
        # Overbought conditions
        rsi = market_data.get("rsi", 50)
        if rsi > 70:
            risks.append(f"Overbought: RSI {rsi:.1f}")
        
        # Low float
        float_shares = market_data.get("float_shares", 0)
        if float_shares < 10000000:
            risks.append(f"Low float: {float_shares/1000000:.1f}M shares")
        
        # Recent decline
        momentum_5d = market_data.get("momentum_5d", 0)
        if momentum_5d < -0.10:
            risks.append(f"Recent weakness: {momentum_5d*100:.1f}% 5-day decline")
        
        # Penny stock
        price = market_data.get("price", 0)
        if price < 5.0:
            risks.append(f"Penny stock risk: ${price:.2f}")
        
        return risks
    
    def _compile_sources(self, symbol: str, market_data: Dict) -> Dict:
        """Compile data sources used in analysis"""
        return {
            "price_data": "Polygon.io",
            "short_interest": "Estimated from market data",
            "technical_indicators": "Calculated from price history",
            "volume_analysis": "30-day rolling average",
            "last_updated": datetime.now().isoformat(),
            "data_quality": self._assess_data_quality(market_data)
        }
    
    def _calculate_confidence(self, market_data: Dict, historical_data: Dict, catalyst_data: Dict) -> float:
        """Calculate confidence score (0-1)"""
        confidence = 0.5  # Base confidence
        
        # Volume confidence
        rel_volume = market_data.get("rel_volume", 1.0)
        if rel_volume > 2.0:
            confidence += 0.15
        elif rel_volume > 1.5:
            confidence += 0.1
        
        # Momentum confidence
        momentum = market_data.get("momentum_21d", 0)
        if momentum > 0.20:
            confidence += 0.15
        elif momentum > 0.10:
            confidence += 0.1
        
        # Technical confidence
        rsi = market_data.get("rsi", 50)
        if 40 < rsi < 70:
            confidence += 0.1
        
        # Catalyst confidence
        if catalyst_data.get("earnings_soon"):
            confidence += 0.1
        
        # Data quality adjustment
        quality = self._assess_data_quality(market_data)
        if quality < 0.8:
            confidence *= quality
        
        return min(1.0, max(0.0, confidence))
    
    def _get_recommendation(self, confidence: float, market_data: Dict) -> str:
        """Get trading recommendation based on confidence and data"""
        if confidence >= 0.8:
            return "STRONG_BUY"
        elif confidence >= 0.65:
            return "BUY"
        elif confidence >= 0.5:
            return "WATCH"
        else:
            return "PASS"
    
    def _calculate_price_target(self, symbol: str, market_data: Dict, confidence: float) -> Dict:
        """Calculate price targets based on analysis"""
        current_price = market_data.get("price", 0)
        if current_price == 0:
            return {"target": 0, "upside": 0, "method": "insufficient_data"}
        
        # Base target on momentum and confidence
        momentum = market_data.get("momentum_21d", 0)
        base_multiplier = 1.0 + (momentum * 0.5) + (confidence * 0.3)
        
        target_price = current_price * base_multiplier
        upside_pct = (target_price - current_price) / current_price
        
        return {
            "target": round(target_price, 2),
            "upside": round(upside_pct * 100, 1),
            "method": "momentum_confidence_model",
            "timeframe": "30_days"
        }
    
    def _estimate_time_horizon(self, catalyst_data: Dict, market_data: Dict) -> str:
        """Estimate optimal holding period"""
        if catalyst_data.get("earnings_soon"):
            return "1-2 weeks"
        elif market_data.get("momentum_21d", 0) > 0.20:
            return "2-4 weeks"
        else:
            return "1-3 months"
    
    def _get_historical_context(self, symbol: str) -> Dict:
        """Get historical price context from Polygon"""
        if not self.polygon_api_key:
            return {}
        
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=90)
        
        url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}"
        params = {"apikey": self.polygon_api_key}
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                results = data["results"]
                return {
                    "90d_high": max(r["h"] for r in results),
                    "90d_low": min(r["l"] for r in results),
                    "avg_volume": sum(r["v"] for r in results) / len(results),
                    "data_points": len(results)
                }
        except Exception as e:
            print(f"Error fetching historical data for {symbol}: {e}")
        
        return {}
    
    def _get_short_interest_data(self, symbol: str) -> Dict:
        """Get short interest data (placeholder - would integrate with real data source)"""
        return {
            "short_interest_ratio": 0.15,  # Placeholder
            "days_to_cover": 2.5,
            "last_updated": datetime.now().date().isoformat()
        }
    
    def _check_catalyst_events(self, symbol: str) -> Dict:
        """Check for upcoming catalyst events"""
        # Placeholder - would integrate with earnings calendar API
        return {
            "earnings_soon": False,
            "news_volume": 3,
            "upcoming_events": []
        }
    
    def _assess_data_quality(self, market_data: Dict) -> float:
        """Assess quality of available data (0-1)"""
        quality = 1.0
        
        required_fields = ["price", "volume", "rsi"]
        for field in required_fields:
            if not market_data.get(field):
                quality -= 0.2
        
        return max(0.0, quality)
    
    def _store_thesis(self, thesis: Dict):
        """Store thesis in database"""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                INSERT OR REPLACE INTO thesis (symbol, version, payload_json, updated_at)
                VALUES (?, 1, ?, ?)
            """, (thesis["symbol"], json.dumps(thesis), thesis["generated_at"]))
            conn.commit()
        finally:
            conn.close()
    
    def _log_thesis_event(self, symbol: str, event_type: str, data: Dict):
        """Log thesis event for learning"""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                INSERT INTO thesis_events (id, symbol, event_type, event_data, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (
                f"{symbol}_{event_type}_{int(datetime.now().timestamp())}",
                symbol,
                event_type,
                json.dumps(data),
                datetime.now().isoformat()
            ))
            conn.commit()
        except sqlite3.OperationalError:
            # Table doesn't exist yet - will be created in schema update
            pass
        finally:
            conn.close()

if __name__ == "__main__":
    # Test thesis generation
    engine = ThesisEngine()
    
    # Example market data
    test_data = {
        "price": 4.50,
        "volume": 2500000,
        "rel_volume": 3.2,
        "rsi": 65.5,
        "momentum_21d": 0.18,
        "short_interest": 0.25,
        "borrow_fee": 0.12,
        "atr_frac": 0.06,
        "float_shares": 15000000
    }
    
    thesis = engine.generate_thesis("BTAI", test_data)
    print(json.dumps(thesis, indent=2))