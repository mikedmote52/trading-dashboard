#!/usr/bin/env python3
"""
Portfolio Manager Background Worker
Analyzes portfolio positions on market-relevant schedule
Creates the feedback loop with VIGL Scanner
"""

import os
import time
import logging
import schedule
import psycopg2
import requests
from datetime import datetime, timedelta
import uuid
import json
from typing import List, Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PortfolioAnalyzer:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.connection = None
        self.alpaca_config = {
            'api_key': os.getenv('APCA_API_KEY_ID', 'PKX1WGCFOD3XXA9LBAR8'),
            'secret_key': os.getenv('APCA_API_SECRET_KEY', 'vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR'),
            'base_url': 'https://paper-api.alpaca.markets'
        }
        self.connect_db()
    
    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.connection = psycopg2.connect(self.database_url)
            self.connection.autocommit = True
            logger.info("✅ Portfolio Manager connected to database")
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            raise
    
    def fetch_alpaca_positions(self) -> List[Dict]:
        """Fetch current positions from Alpaca"""
        try:
            headers = {
                'APCA-API-KEY-ID': self.alpaca_config['api_key'],
                'APCA-API-SECRET-KEY': self.alpaca_config['secret_key']
            }
            
            response = requests.get(
                f"{self.alpaca_config['base_url']}/v2/positions",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                positions = response.json()
                logger.info(f"📊 Fetched {len(positions)} positions from Alpaca")
                return positions
            else:
                logger.error(f"❌ Alpaca API error: {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"❌ Failed to fetch positions: {e}")
            return []
    
    def analyze_position_performance(self, position: Dict) -> Dict:
        """Analyze individual position against thesis"""
        symbol = position['symbol']
        current_price = float(position['current_price'])
        avg_entry = float(position['avg_entry_price'])
        unrealized_plpc = float(position['unrealized_plpc'])
        market_value = float(position['market_value'])
        
        # Calculate key metrics
        pnl_percent = unrealized_plpc * 100
        days_held = (datetime.now() - datetime.fromisoformat(position.get('acquired_at', datetime.now().isoformat()))).days
        
        # Risk scoring (WOLF pattern detection)
        risk_score = 0.3  # Base risk
        if pnl_percent < -20:
            risk_score += 0.4
        elif pnl_percent < -15:
            risk_score += 0.3
        elif pnl_percent < -10:
            risk_score += 0.2
        
        # Position size risk
        portfolio_value = 25000  # TODO: Get from account API
        position_weight = market_value / portfolio_value
        if position_weight > 0.2:
            risk_score += 0.2
        
        # Determine action
        action = 'HOLD'
        alert_level = 'INFO'
        message = f"Position stable at {pnl_percent:.1f}%"
        
        if risk_score >= 0.8:
            action = 'SELL'
            alert_level = 'CRITICAL'
            message = f"HIGH RISK: Down {abs(pnl_percent):.1f}% - Consider exit"
        elif risk_score >= 0.6:
            action = 'REDUCE'
            alert_level = 'WARNING'
            message = f"MODERATE RISK: Down {abs(pnl_percent):.1f}% - Consider reducing"
        elif pnl_percent > 30 and days_held > 5:
            action = 'TAKE_PROFIT'
            alert_level = 'OPPORTUNITY'
            message = f"WINNER: Up {pnl_percent:.1f}% - Consider profit taking"
        elif pnl_percent > 15:
            action = 'TRAIL_STOP'
            alert_level = 'INFO'
            message = f"PROFITABLE: Up {pnl_percent:.1f}% - Set trailing stop"
        
        # Check against VIGL thesis (if position came from VIGL discovery)
        thesis_status = self.check_vigl_thesis(symbol, pnl_percent)
        
        return {
            'symbol': symbol,
            'current_price': current_price,
            'entry_price': avg_entry,
            'pnl_percent': pnl_percent,
            'market_value': market_value,
            'position_weight': position_weight * 100,
            'days_held': days_held,
            'risk_score': risk_score,
            'action': action,
            'alert_level': alert_level,
            'message': message,
            'thesis_status': thesis_status,
            'analyzed_at': datetime.now()
        }
    
    def check_vigl_thesis(self, symbol: str, current_performance: float) -> str:
        """Check if position is meeting VIGL thesis expectations"""
        cursor = self.connection.cursor()
        
        try:
            # Get original VIGL discovery for this symbol
            cursor.execute("""
                SELECT confidence_score, estimated_upside, discovered_at
                FROM vigl_discoveries
                WHERE symbol = %s
                ORDER BY discovered_at DESC
                LIMIT 1
            """, (symbol,))
            
            result = cursor.fetchone()
            
            if result:
                confidence, upside_range, discovered_at = result
                days_since_discovery = (datetime.now() - discovered_at).days
                
                # Parse upside expectation (e.g., "100-200%")
                min_upside = 100
                if '-' in upside_range:
                    min_upside = int(upside_range.split('-')[0].replace('%', ''))
                
                # Expected performance based on time held
                expected_progress = (min_upside / 30) * days_since_discovery  # Linear expectation over 30 days
                
                if current_performance >= expected_progress:
                    return 'EXCEEDING_THESIS'
                elif current_performance >= expected_progress * 0.5:
                    return 'ON_TRACK'
                else:
                    return 'UNDERPERFORMING'
            
            return 'NO_THESIS'
            
        except Exception as e:
            logger.error(f"❌ Failed to check VIGL thesis: {e}")
            return 'UNKNOWN'
        finally:
            cursor.close()
    
    def save_portfolio_alerts(self, alerts: List[Dict], session_id: str):
        """Save portfolio alerts to database"""
        cursor = self.connection.cursor()
        
        try:
            for alert in alerts:
                cursor.execute("""
                    INSERT INTO portfolio_alerts (
                        symbol, current_price, entry_price, pnl_percent,
                        market_value, position_weight, days_held,
                        risk_score, action, alert_level, message,
                        thesis_status, session_id, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    alert['symbol'],
                    alert['current_price'],
                    alert['entry_price'],
                    alert['pnl_percent'],
                    alert['market_value'],
                    alert['position_weight'],
                    alert['days_held'],
                    alert['risk_score'],
                    alert['action'],
                    alert['alert_level'],
                    alert['message'],
                    alert['thesis_status'],
                    session_id,
                    alert['analyzed_at']
                ))
            
            logger.info(f"✅ Saved {len(alerts)} portfolio alerts")
            
        except Exception as e:
            logger.error(f"❌ Failed to save alerts: {e}")
        finally:
            cursor.close()
    
    def run_portfolio_analysis(self):
        """Main portfolio analysis routine"""
        session_id = str(uuid.uuid4())
        market_context = self.get_market_context()
        
        logger.info(f"📊 Starting portfolio analysis - {market_context}")
        
        try:
            # Fetch current positions
            positions = self.fetch_alpaca_positions()
            
            if not positions:
                logger.info("📭 No positions to analyze")
                return
            
            # Analyze each position
            alerts = []
            critical_alerts = []
            
            for position in positions:
                analysis = self.analyze_position_performance(position)
                alerts.append(analysis)
                
                # Track critical alerts
                if analysis['alert_level'] in ['CRITICAL', 'WARNING', 'OPPORTUNITY']:
                    critical_alerts.append(analysis)
                    logger.info(f"   🚨 {analysis['symbol']}: {analysis['message']}")
            
            # Save to database
            self.save_portfolio_alerts(alerts, session_id)
            
            # Log summary
            logger.info(f"✅ Portfolio analysis complete:")
            logger.info(f"   • {len(positions)} positions analyzed")
            logger.info(f"   • {len(critical_alerts)} critical alerts")
            logger.info(f"   • {sum(1 for a in alerts if a['action'] == 'SELL')} SELL signals")
            logger.info(f"   • {sum(1 for a in alerts if a['action'] == 'TAKE_PROFIT')} PROFIT signals")
            
            # Create portfolio health summary
            self.save_portfolio_health_summary(alerts, session_id)
            
        except Exception as e:
            logger.error(f"❌ Portfolio analysis failed: {e}")
    
    def get_market_context(self) -> str:
        """Determine current market context"""
        now = datetime.now()
        hour = now.hour
        
        if 6 <= hour < 7:
            return "PRE_MARKET"
        elif 7 <= hour < 10:
            return "MARKET_OPEN"
        elif 10 <= hour < 12:
            return "MIDDAY"
        elif 12 <= hour < 13:
            return "POWER_HOUR"
        elif 13 <= hour < 17:
            return "AFTER_CLOSE"
        else:
            return "AFTER_HOURS"
    
    def save_portfolio_health_summary(self, alerts: List[Dict], session_id: str):
        """Save overall portfolio health metrics"""
        cursor = self.connection.cursor()
        
        try:
            total_value = sum(a['market_value'] for a in alerts)
            avg_pnl = sum(a['pnl_percent'] for a in alerts) / len(alerts) if alerts else 0
            high_risk_count = sum(1 for a in alerts if a['risk_score'] >= 0.6)
            
            cursor.execute("""
                INSERT INTO portfolio_health (
                    session_id, total_positions, total_value,
                    average_pnl_percent, high_risk_positions,
                    sell_signals, profit_signals, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                session_id,
                len(alerts),
                total_value,
                avg_pnl,
                high_risk_count,
                sum(1 for a in alerts if a['action'] == 'SELL'),
                sum(1 for a in alerts if a['action'] == 'TAKE_PROFIT'),
                datetime.now()
            ))
            
            logger.info(f"📈 Portfolio Health: {len(alerts)} positions, {avg_pnl:.1f}% avg P&L, {high_risk_count} high risk")
            
        except Exception as e:
            logger.error(f"❌ Failed to save health summary: {e}")
        finally:
            cursor.close()

class PortfolioBackgroundWorker:
    def __init__(self):
        self.database_url = os.getenv('DATABASE_URL')
        
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        
        self.analyzer = PortfolioAnalyzer(self.database_url)
        logger.info("🚀 Portfolio Background Worker initialized")
    
    def setup_schedule(self):
        """Setup market-aware scheduling"""
        # Pacific Time schedule (adjust for your timezone)
        schedule.every().day.at("06:30").do(self.analyzer.run_portfolio_analysis)  # Pre-market
        schedule.every().day.at("09:30").do(self.analyzer.run_portfolio_analysis)  # Market open
        schedule.every().day.at("12:00").do(self.analyzer.run_portfolio_analysis)  # Midday
        schedule.every().day.at("15:00").do(self.analyzer.run_portfolio_analysis)  # Power hour
        schedule.every().day.at("17:00").do(self.analyzer.run_portfolio_analysis)  # After close
        
        logger.info("⏰ Portfolio analysis scheduled for key market times")
    
    def start(self):
        """Start the portfolio manager"""
        # Initial analysis
        logger.info("🎯 Running initial portfolio analysis...")
        self.analyzer.run_portfolio_analysis()
        
        # Setup schedule
        self.setup_schedule()
        
        # Keep running
        logger.info("📊 Portfolio Manager running - analyzing at market-relevant times")
        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute

if __name__ == "__main__":
    try:
        worker = PortfolioBackgroundWorker()
        worker.start()
    except KeyboardInterrupt:
        logger.info("🛑 Portfolio worker stopped by user")
    except Exception as e:
        logger.error(f"💥 Portfolio worker crashed: {e}")
        raise