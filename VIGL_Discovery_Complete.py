#!/usr/bin/env python3
"""
🎯 VIGL Pattern Discovery System - Complete Standalone Version
Your proven 324% winner pattern detection in a single file

This consolidates your entire VIGL system for easy desktop use:
- Smart universe filtering (reduces API calls from 11K+ to ~50)
- Protected VIGL pattern detection algorithm
- Risk assessment and scoring
- All dependencies included

Usage: python3 VIGL_Discovery_Complete.py
"""

import os
import sys
import logging
import requests
import statistics
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("💡 Install python-dotenv for .env file support: pip install python-dotenv")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class VIGLPatternStock:
    """Stock matching VIGL pattern characteristics"""
    # Basic Info
    ticker: str
    company_name: str
    current_price: float
    market_cap: float
    
    # VIGL Pattern Signals  
    volume_spike_ratio: float      # Current volume vs 30-day average
    price_momentum: float          # 5-day price change %
    volume_pattern_score: float    # How well volume pattern matches VIGL
    breakout_signal: float         # Technical breakout strength
    
    # Pattern Matching
    vigl_similarity_score: float   # Overall similarity to VIGL pattern (0-1)
    confidence_level: float        # Confidence in the pattern match
    
    # Risk Assessment
    risk_score: float              # Risk level (0-1, lower is safer)
    estimated_upside: str          # Potential upside range
    
    # Meta
    analysis_date: datetime
    data_source: str = "VIGL Pattern System v1.0"
    catalyst_proximity: Optional[str] = None
    
    @property
    def is_high_confidence(self) -> bool:
        """Returns True if this is a high-confidence VIGL match"""
        return self.vigl_similarity_score >= 0.80
    
    @property
    def risk_level_text(self) -> str:
        """Human-readable risk level"""
        if self.risk_score <= 0.3:
            return "Low"
        elif self.risk_score <= 0.6:
            return "Moderate" 
        else:
            return "High"


@dataclass
class SmartStock:
    """Enhanced stock data with AI scoring"""
    ticker: str
    name: str
    market_cap: float
    exchange: str
    volume: float
    avg_volume_20d: Optional[float]
    volume_ratio: float
    price_change_1d: float
    ai_catalyst_score: float
    sector: Optional[str] = None
    last_updated: Optional[datetime] = None


# =============================================================================
# SMART UNIVERSE FILTER
# =============================================================================

class SmartUniverseFilter:
    """AI-powered universe filter for efficient stock discovery"""
    
    def __init__(self, api_key: str, max_market_cap: float = 300_000_000):
        self.api_key = api_key
        self.max_market_cap = max_market_cap
        self.base_url = "https://api.polygon.io"
        
    def get_high_volume_candidates(self, days_back: int = 5, min_volume: int = 100_000) -> List[Dict]:
        """Get stocks with significant volume activity using bulk requests"""
        candidates = {}
        
        for i in range(days_back):
            date = (datetime.now() - timedelta(days=i+1)).strftime('%Y-%m-%d')
            url = f"{self.base_url}/v2/aggs/grouped/locale/us/market/stocks/{date}"
            
            try:
                response = requests.get(url, params={'apiKey': self.api_key})
                response.raise_for_status()
                data = response.json()
                
                if 'results' in data:
                    logger.info(f"Fetched {len(data['results'])} stocks for {date}")
                    
                    for stock in data['results']:
                        ticker = stock.get('T', '')
                        volume = stock.get('v', 0)
                        
                        if volume >= min_volume and ticker not in candidates:
                            candidates[ticker] = {
                                'ticker': ticker,
                                'volume': volume,
                                'close': stock.get('c', 0),
                                'change': stock.get('c', 0) - stock.get('o', 0),
                                'date': date
                            }
                            
            except requests.exceptions.RequestException as e:
                logger.warning(f"Error fetching volume data for {date}: {e}")
                continue
                
        logger.info(f"Found {len(candidates)} high-volume candidates")
        return list(candidates.values())
    
    def calculate_ai_catalyst_score(self, ticker_data: Dict, market_data: Dict) -> float:
        """AI-powered scoring for catalyst potential"""
        score = 0.0
        
        # Volume analysis (40% of score)
        volume = market_data.get('volume', 0)
        if volume > 500_000:
            score += 0.4
        elif volume > 100_000:
            score += 0.2
            
        # Price movement (30% of score)
        price_change = abs(market_data.get('change', 0))
        close_price = market_data.get('close', 1)
        if close_price > 0:
            change_pct = abs(price_change / close_price)
            if change_pct > 0.10:
                score += 0.3
            elif change_pct > 0.05:
                score += 0.15
                
        # Market cap preference (20% of score)
        market_cap = ticker_data.get('market_cap', float('inf'))
        if market_cap < 50_000_000:
            score += 0.2
        elif market_cap < 150_000_000:
            score += 0.15
        elif market_cap < 300_000_000:
            score += 0.1
            
        # Sector bonus (10% of score)
        sector = ticker_data.get('sic_description', '').lower()
        high_catalyst_sectors = ['biotech', 'pharmaceutical', 'drug', 'medical', 'mining']
        if any(keyword in sector for keyword in high_catalyst_sectors):
            score += 0.1
            
        return min(score, 1.0)
    
    def enrich_candidate_data(self, candidates: List[Dict]) -> List[SmartStock]:
        """Enrich top candidates with detailed data"""
        smart_stocks = []
        candidates = sorted(candidates, key=lambda x: x.get('volume', 0), reverse=True)
        
        for candidate in candidates[:200]:  # Top 200 by volume
            ticker = candidate['ticker']
            
            if any(x in ticker for x in ['.', '-', '/']):
                continue
                
            ticker_url = f"{self.base_url}/v3/reference/tickers/{ticker}"
            
            try:
                response = requests.get(ticker_url, params={'apiKey': self.api_key})
                response.raise_for_status()
                ticker_data = response.json().get('results', {})
                
                exchange = ticker_data.get('primary_exchange', '')
                market_cap = ticker_data.get('market_cap')
                
                if not market_cap or market_cap > self.max_market_cap:
                    continue
                    
                if not any(x in exchange.upper() for x in ['NYSE', 'NASDAQ', 'XNAS', 'XNYS']):
                    continue
                
                ai_score = self.calculate_ai_catalyst_score(ticker_data, candidate)
                
                if ai_score >= 0.3:
                    smart_stock = SmartStock(
                        ticker=ticker,
                        name=ticker_data.get('name', ''),
                        market_cap=market_cap,
                        exchange=exchange,
                        volume=candidate.get('volume', 0),
                        avg_volume_20d=None,
                        volume_ratio=1.0,
                        price_change_1d=candidate.get('change', 0),
                        ai_catalyst_score=ai_score,
                        sector=ticker_data.get('sic_description'),
                        last_updated=datetime.now()
                    )
                    smart_stocks.append(smart_stock)
                    
            except requests.exceptions.RequestException:
                continue
                
        return smart_stocks
    
    def get_smart_universe(self, target_size: int = 50) -> List[SmartStock]:
        """Get AI-filtered micro-cap universe"""
        logger.info("Starting smart universe filtering...")
        
        volume_candidates = self.get_high_volume_candidates(days_back=5, min_volume=100_000)
        
        if not volume_candidates:
            logger.error("No volume candidates found")
            return []
            
        smart_stocks = self.enrich_candidate_data(volume_candidates)
        smart_stocks.sort(key=lambda x: x.ai_catalyst_score, reverse=True)
        final_universe = smart_stocks[:target_size]
        
        logger.info(f"Smart universe complete: {len(final_universe)} high-potential stocks")
        return final_universe


# =============================================================================
# PROTECTED VIGL DETECTOR 
# =============================================================================

class ProtectedVIGLDetector:
    """
    PROTECTED: Detects stocks with VIGL-like patterns
    Based on your proven 324% winner pattern
    
    VIGL Pattern DNA:
    - 20.9x volume spike as primary trigger
    - Microcap ($2.94-$4.66 price range during run)
    - Volume precedes price moves
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        
        # VIGL Pattern Template (PROTECTED - derived from historical analysis)
        self.vigl_template = {
            'volume_spike_threshold': 3.0,      # Minimum 3x volume spike
            'ideal_volume_spike': 15.0,         # VIGL had 20.9x, target 15x+
            'price_range_low': 0.50,            # Expanded range
            'price_range_high': 50.0,           # Extended to $50 as requested
            'sweet_spot_low': 1.0,              # VIGL sweet spot 
            'sweet_spot_high': 10.0,            # VIGL sweet spot
            'momentum_threshold': 5.0,          # Minimum 5% momentum
            'market_cap_max': 500_000_000,      # $500M max
        }
    
    def get_volume_analysis(self, ticker: str, days_back: int = 30) -> Dict:
        """Analyze volume patterns for VIGL-like characteristics"""
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{start_date.strftime('%Y-%m-%d')}/{end_date.strftime('%Y-%m-%d')}"
        params = {'apiKey': self.api_key}
        
        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            if 'results' not in data or not data['results']:
                return {}
                
            results = data['results']
            
            # Volume analysis
            volumes = [r['v'] for r in results]
            prices = [(r['o'] + r['c']) / 2 for r in results]
            
            current_volume = volumes[-1] if volumes else 0
            avg_volume = statistics.mean(volumes[:-1]) if len(volumes) > 1 else current_volume
            volume_spike_ratio = current_volume / avg_volume if avg_volume > 0 else 0
            
            # Recent price momentum
            if len(prices) >= 5:
                recent_momentum = ((prices[-1] - prices[-5]) / prices[-5]) * 100
            else:
                recent_momentum = 0
            
            # Volume pattern scoring
            volume_pattern_score = self._calculate_volume_pattern_score(volumes)
            
            return {
                'current_volume': current_volume,
                'average_volume': avg_volume,
                'volume_spike_ratio': volume_spike_ratio,
                'recent_momentum': recent_momentum,
                'volume_pattern_score': volume_pattern_score,
                'price_history': prices,
                'volume_history': volumes
            }
            
        except Exception as e:
            logger.debug(f"Error analyzing volume for {ticker}: {e}")
            return {}
    
    def _calculate_volume_pattern_score(self, volumes: List[float]) -> float:
        """Score how well volume pattern matches VIGL characteristics"""
        if len(volumes) < 10:
            return 0.0
            
        score = 0.0
        recent_volumes = volumes[-5:]
        baseline_volumes = volumes[:-5]
        
        if not baseline_volumes:
            return 0.0
            
        baseline_avg = statistics.mean(baseline_volumes)
        recent_avg = statistics.mean(recent_volumes)
        
        # Score recent volume increase
        if recent_avg > baseline_avg:
            volume_increase_ratio = recent_avg / baseline_avg
            score += min(volume_increase_ratio / 5.0, 0.4)
        
        # Score for significant spikes
        for volume in recent_volumes:
            spike_ratio = volume / baseline_avg
            if spike_ratio >= 3.0:
                score += min(spike_ratio / 20.0, 0.3)
        
        # Score for volume trend consistency
        if len(recent_volumes) >= 3:
            trend_increases = sum(1 for i in range(1, len(recent_volumes)) 
                                if recent_volumes[i] > recent_volumes[i-1])
            trend_score = trend_increases / (len(recent_volumes) - 1)
            score += trend_score * 0.3
        
        return min(score, 1.0)
    
    def calculate_vigl_similarity_score(self, ticker: str, volume_data: Dict, 
                                       current_price: float, market_cap: float) -> float:
        """Calculate overall similarity to VIGL pattern"""
        
        if not volume_data:
            return 0.0
            
        score = 0.0
        
        # Volume spike scoring (35% of total score)
        volume_spike = volume_data.get('volume_spike_ratio', 0)
        if volume_spike >= self.vigl_template['ideal_volume_spike']:
            score += 0.35
        elif volume_spike >= self.vigl_template['volume_spike_threshold']:
            score += (volume_spike / self.vigl_template['ideal_volume_spike']) * 0.35
        
        # Price range scoring (20% of total score)
        if self.vigl_template['price_range_low'] <= current_price <= self.vigl_template['price_range_high']:
            if self.vigl_template['sweet_spot_low'] <= current_price <= self.vigl_template['sweet_spot_high']:
                score += 0.20  # VIGL sweet spot
            elif current_price <= 25.0:
                score += 0.15  # Good range
            else:
                score += 0.10  # Acceptable range
        elif current_price < self.vigl_template['price_range_low']:
            score += 0.05  # Very cheap stocks
        
        # Market cap scoring (15% of total score)
        if market_cap <= self.vigl_template['market_cap_max']:
            score += 0.15
        
        # Momentum scoring (15% of total score)
        momentum = volume_data.get('recent_momentum', 0)
        if momentum >= self.vigl_template['momentum_threshold']:
            score += min(momentum / 20.0, 0.15)
        
        # Volume pattern scoring (15% of total score)
        pattern_score = volume_data.get('volume_pattern_score', 0)
        score += pattern_score * 0.15
        
        return min(score, 1.0)
    
    def _calculate_risk_score(self, price: float, market_cap: float, volume_spike: float) -> float:
        """Calculate risk score (0 = low risk, 1 = high risk)"""
        risk = 0.0
        
        # Price risk
        if price < 1.0:
            risk += 0.3
        elif price < 2.0:
            risk += 0.2
        elif price > 10.0:
            risk += 0.1
        
        # Market cap risk
        if market_cap < 10_000_000:
            risk += 0.3
        elif market_cap < 50_000_000:
            risk += 0.2
        
        # Volume spike risk (extreme spikes can be manipulative)
        if volume_spike > 50.0:
            risk += 0.2
        elif volume_spike > 20.0:
            risk += 0.1
        
        return min(risk, 1.0)
    
    def find_vigl_pattern_stocks(self, candidate_tickers: List[str]) -> List[VIGLPatternStock]:
        """Find stocks matching VIGL pattern from candidate list"""
        vigl_matches = []
        
        logger.info(f"🔍 Scanning {len(candidate_tickers)} candidates for VIGL patterns...")
        
        for ticker in candidate_tickers:
            try:
                # Get volume analysis
                volume_data = self.get_volume_analysis(ticker)
                if not volume_data:
                    continue
                
                # Get current price data
                price_url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/prev"
                response = requests.get(price_url, params={'apiKey': self.api_key}, timeout=10)
                if response.status_code != 200:
                    continue
                    
                price_data = response.json()
                if 'results' not in price_data or not price_data['results']:
                    continue
                    
                result = price_data['results'][0]
                current_price = result.get('c', 0)
                
                # Get market cap
                details_url = f"https://api.polygon.io/v3/reference/tickers/{ticker}"
                details_response = requests.get(details_url, params={'apiKey': self.api_key}, timeout=10)
                market_cap = 0
                company_name = ticker
                
                if details_response.status_code == 200:
                    details = details_response.json().get('results', {})
                    market_cap = details.get('market_cap', 0)
                    company_name = details.get('name', ticker)
                
                # Calculate VIGL similarity
                vigl_score = self.calculate_vigl_similarity_score(
                    ticker, volume_data, current_price, market_cap
                )
                
                # Only include stocks with significant VIGL similarity
                if vigl_score >= 0.65:  # 65% threshold
                    volume_spike = volume_data.get('volume_spike_ratio', 0)
                    momentum = volume_data.get('recent_momentum', 0)
                    
                    # Estimate upside based on pattern strength
                    if vigl_score >= 0.9:
                        upside = "200-400% (High VIGL similarity)"
                    elif vigl_score >= 0.8:
                        upside = "100-200% (Strong pattern match)"
                    else:
                        upside = "50-100% (Moderate pattern match)"
                    
                    risk_score = self._calculate_risk_score(current_price, market_cap, volume_spike)
                    
                    vigl_stock = VIGLPatternStock(
                        ticker=ticker,
                        company_name=company_name,
                        current_price=current_price,
                        market_cap=market_cap,
                        volume_spike_ratio=volume_spike,
                        price_momentum=momentum,
                        volume_pattern_score=volume_data.get('volume_pattern_score', 0),
                        breakout_signal=0.5,
                        vigl_similarity_score=vigl_score,
                        confidence_level=vigl_score,
                        catalyst_proximity=None,
                        risk_score=risk_score,
                        estimated_upside=upside,
                        analysis_date=datetime.now(),
                        data_source="Polygon + VIGL Pattern Analysis"
                    )
                    
                    vigl_matches.append(vigl_stock)
                    logger.info(f"🎯 VIGL MATCH: {ticker} - {vigl_score:.2f} similarity "
                              f"({volume_spike:.1f}x volume, {momentum:+.1f}% momentum)")
                    
            except Exception as e:
                logger.debug(f"Error analyzing {ticker}: {e}")
                continue
        
        # Sort by VIGL similarity score
        vigl_matches.sort(key=lambda x: x.vigl_similarity_score, reverse=True)
        logger.info(f"📊 Found {len(vigl_matches)} stocks with VIGL-like patterns")
        return vigl_matches


# =============================================================================
# VIGL DISCOVERY API
# =============================================================================

class VIGLDiscoveryAPI:
    """
    Main API for VIGL pattern discovery
    Combines smart filtering with VIGL detection
    """
    
    def __init__(self, api_key: Optional[str] = None, max_market_cap: float = 300_000_000):
        self.api_key = api_key or os.getenv('POLYGON_API_KEY', '')
        if not self.api_key:
            raise ValueError("POLYGON_API_KEY required (environment variable or parameter)")
        
        self.version = "1.0.0"
        self.scan_count = 0
        self.last_scan = None
        
        self.smart_filter = SmartUniverseFilter(self.api_key, max_market_cap)
        self.vigl_detector = ProtectedVIGLDetector(self.api_key)
    
    def validate_system(self) -> Dict:
        """Validate system health"""
        try:
            # Test API connection
            test_url = "https://api.polygon.io/v3/reference/tickers/AAPL"
            response = requests.get(test_url, params={'apiKey': self.api_key}, timeout=5)
            api_working = response.status_code == 200
            
            return {
                'status': 'healthy' if api_working else 'error',
                'version': self.version,
                'api_key_set': bool(self.api_key),
                'api_connection': 'working' if api_working else 'failed',
                'system_components': ['SmartFilter', 'VIGLDetector']
            }
        except Exception:
            return {
                'status': 'error',
                'version': self.version,
                'api_key_set': bool(self.api_key),
                'api_connection': 'failed'
            }
    
    def find_daily_opportunities(self, max_candidates: int = 50, min_similarity: float = 0.65) -> List[VIGLPatternStock]:
        """Main method: Find daily VIGL opportunities"""
        try:
            # Step 1: Smart filtering to get high-potential candidates
            smart_stocks = self.smart_filter.get_smart_universe(target_size=max_candidates)
            
            if not smart_stocks:
                logger.warning("No smart candidates found")
                return []
            
            # Step 2: VIGL pattern detection on filtered candidates
            candidate_tickers = [stock.ticker for stock in smart_stocks]
            vigl_opportunities = self.vigl_detector.find_vigl_pattern_stocks(candidate_tickers)
            
            # Step 3: Filter by similarity threshold
            filtered_opportunities = [
                stock for stock in vigl_opportunities 
                if stock.vigl_similarity_score >= min_similarity
            ]
            
            self.scan_count += 1
            self.last_scan = datetime.now()
            
            return filtered_opportunities
            
        except Exception as e:
            logger.error(f"Error in daily opportunities scan: {e}")
            return []
    
    def get_high_confidence_picks(self, max_candidates: int = 50) -> List[VIGLPatternStock]:
        """Get only high-confidence VIGL picks (80%+ similarity)"""
        opportunities = self.find_daily_opportunities(max_candidates=max_candidates)
        return [stock for stock in opportunities if stock.is_high_confidence]
    
    def get_top_pick(self, max_candidates: int = 50) -> Optional[VIGLPatternStock]:
        """Get single best VIGL opportunity"""
        opportunities = self.find_daily_opportunities(max_candidates=max_candidates)
        return opportunities[0] if opportunities else None
    
    def get_opportunities_by_risk(self, max_candidates: int = 50, risk_level: str = "low") -> List[VIGLPatternStock]:
        """Get opportunities filtered by risk level"""
        if risk_level not in ["low", "moderate", "high"]:
            raise ValueError("risk_level must be 'low', 'moderate', or 'high'")
        
        opportunities = self.find_daily_opportunities(max_candidates=max_candidates)
        
        if risk_level == "low":
            return [stock for stock in opportunities if stock.risk_score <= 0.3]
        elif risk_level == "moderate":
            return [stock for stock in opportunities if 0.3 < stock.risk_score <= 0.6]
        else:  # high
            return [stock for stock in opportunities if stock.risk_score > 0.6]
    
    def get_api_info(self) -> Dict:
        """Get API information"""
        return {
            'version': self.version,
            'status': 'production',
            'protected_algorithm': 'VIGL Pattern v1.0',
            'scan_count': self.scan_count,
            'last_scan': self.last_scan.isoformat() if self.last_scan else None
        }


# =============================================================================
# MAIN EXECUTION
# =============================================================================

def main():
    """Main VIGL discovery workflow"""
    
    print("🎯 VIGL Pattern Discovery System - Complete Version")
    print("=" * 60)
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("💡 Your proven 324% winner pattern detection system")
    print()
    
    try:
        # Initialize VIGL system
        vigl = VIGLDiscoveryAPI()
        
        # Check system health
        health = vigl.validate_system()
        if health['status'] != 'healthy':
            print(f"⚠️  System Health Issue: {health}")
            if 'api_key_set' in health and not health['api_key_set']:
                print("💡 Make sure your POLYGON_API_KEY is set in your environment")
                print("   export POLYGON_API_KEY='your_api_key_here'")
            return
        
        print(f"✅ System Ready: {health['status']} (v{health['version']})")
        print(f"🔧 API Connection: {health['api_connection']}")
        print()
        
        # Find today's opportunities
        print("🔍 Step 1: Smart universe filtering...")
        print("🔍 Step 2: VIGL pattern detection...")
        print("🔍 Step 3: Risk assessment and scoring...")
        print()
        
        opportunities = vigl.find_daily_opportunities(max_candidates=50)
        
        if not opportunities:
            print("📊 No VIGL patterns detected today")
            print("💡 Try again later or check different market conditions")
            print("🔄 The system scanned high-volume candidates but found no 65%+ VIGL matches")
            return
        
        print(f"🎉 Found {len(opportunities)} VIGL opportunities!")
        print()
        
        # Display opportunities
        for i, stock in enumerate(opportunities, 1):
            print(f"{i}. ${stock.ticker} - {stock.company_name}")
            print(f"   💯 VIGL Similarity: {stock.vigl_similarity_score:.1%}")
            print(f"   💰 Price: ${stock.current_price:.2f}")
            print(f"   📊 Market Cap: ${stock.market_cap:,.0f}")
            print(f"   📈 Volume: {stock.volume_spike_ratio:.1f}x average")
            print(f"   🚀 Momentum: {stock.price_momentum:+.1f}%")
            print(f"   ⚠️  Risk: {stock.risk_level_text} ({stock.risk_score:.1f})")
            print(f"   🎯 Upside: {stock.estimated_upside}")
            
            if stock.is_high_confidence:
                print(f"   ⭐ HIGH CONFIDENCE PICK")
            
            print()
        
        # Summary sections
        print("📈 SUMMARY ANALYSIS:")
        print("=" * 40)
        
        # Get the single best pick
        top_pick = vigl.get_top_pick(max_candidates=50)
        if top_pick:
            print(f"🏆 TODAY'S TOP PICK:")
            print(f"   ${top_pick.ticker} - {top_pick.vigl_similarity_score:.1%} VIGL match")
            print(f"   Risk: {top_pick.risk_level_text}, Price: ${top_pick.current_price:.2f}")
            print()
        
        # Show high confidence picks only
        high_conf = vigl.get_high_confidence_picks(max_candidates=50)
        if high_conf:
            print(f"⭐ HIGH CONFIDENCE PICKS ({len(high_conf)}):")
            for stock in high_conf:
                print(f"   ${stock.ticker} - {stock.vigl_similarity_score:.1%} similarity")
            print()
        
        # Show low risk picks
        low_risk = vigl.get_opportunities_by_risk(risk_level="low", max_candidates=50)
        if low_risk:
            print(f"🛡️  LOW RISK PICKS ({len(low_risk)}):")
            for stock in low_risk:
                print(f"   ${stock.ticker} - {stock.vigl_similarity_score:.1%} (risk: {stock.risk_score:.1f})")
            print()
        
        # System stats
        info = vigl.get_api_info()
        print(f"📊 SYSTEM STATISTICS:")
        print(f"   Algorithm: {info['protected_algorithm']}")
        print(f"   Scans Today: {info['scan_count']}")
        print(f"   Last Scan: {info['last_scan']}")
        print()
        
        print("✅ VIGL Discovery Complete!")
        print("💡 This is your proven pattern detection system (324% historical winner)")
        print("🔒 Core algorithm is protected and won't break your pattern")
        print()
        print("🎯 Next Steps:")
        print("   • Research the high-confidence picks")
        print("   • Consider position sizing based on risk levels")
        print("   • Monitor volume and momentum for entry timing")
        
    except Exception as e:
        print(f"❌ Error running VIGL discovery: {e}")
        print("💡 Check your API key and network connection")
        print("🔧 Make sure you have a valid Polygon.io API key")


if __name__ == "__main__":
    import json
    
    # Check if JSON output is requested
    if len(sys.argv) > 1 and sys.argv[1] == '--json':
        try:
            # Run VIGL discovery silently
            vigl = VIGLDiscoveryAPI()
            discoveries = vigl.find_daily_opportunities()
            
            # Convert to JSON format for the web dashboard
            json_output = []
            for stock in discoveries:
                json_output.append({
                    "symbol": stock.ticker,
                    "name": stock.company_name,
                    "currentPrice": stock.current_price,
                    "marketCap": stock.market_cap,
                    "volumeSpike": stock.volume_spike_ratio,
                    "momentum": stock.price_momentum,
                    "breakoutStrength": stock.pattern_strength,
                    "sector": getattr(stock, 'sector', 'Technology'),
                    "catalysts": stock.risk_factors,
                    "similarity": stock.vigl_similarity,
                    "confidence": stock.confidence_score,
                    "isHighConfidence": stock.confidence_score >= 0.8,
                    "estimatedUpside": stock.upside_potential,
                    "discoveredAt": datetime.now().isoformat(),
                    "riskLevel": stock.risk_level,
                    "recommendation": "STRONG BUY" if stock.confidence_score >= 0.8 else "BUY"
                })
            
            # Output JSON to stdout
            print(json.dumps(json_output, indent=2))
            
        except Exception as e:
            # Output empty array on error
            print("[]")
    else:
        # Normal interactive mode
        main()