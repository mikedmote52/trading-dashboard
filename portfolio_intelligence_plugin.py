#!/usr/bin/env python3
"""
Portfolio Intelligence Plugin for Existing Dashboard
Adds portfolio alerts to existing alerts array without disrupting current system
"""

import requests
import json
from datetime import datetime, timedelta

class PortfolioIntelligencePlugin:
    def __init__(self):
        # Alpaca API configuration (from your existing system)
        self.alpaca_headers = {
            'APCA-API-KEY-ID': 'PKX1WGCFOD3XXA9LBAR8',
            'APCA-API-SECRET-KEY': 'vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR'
        }
        self.alpaca_base = 'https://paper-api.alpaca.markets'
    
    def generate_portfolio_alerts(self):
        """Generate alerts that integrate with existing dashboard alerts array"""
        alerts = []
        
        try:
            # Get real portfolio data
            positions_response = requests.get(
                f"{self.alpaca_base}/v2/positions",
                headers=self.alpaca_headers
            )
            
            account_response = requests.get(
                f"{self.alpaca_base}/v2/account", 
                headers=self.alpaca_headers
            )
            
            if positions_response.status_code == 200 and account_response.status_code == 200:
                positions = positions_response.json()
                account = account_response.json()
                
                alerts.extend(self._analyze_portfolio(positions, account))
                alerts.extend(self._analyze_risk_levels(positions))
                alerts.extend(self._analyze_performance(positions))
                alerts.extend(self._generate_strategy_alerts())
                
        except Exception as e:
            # Fallback alert if API fails
            alerts.append({
                'title': '📊 Portfolio Status',
                'message': 'Unable to fetch live portfolio data',
                'timestamp': datetime.now().isoformat(),
                'severity': 'MEDIUM'
            })
        
        return alerts
    
    def _analyze_portfolio(self, positions, account):
        """Analyze overall portfolio health"""
        alerts = []
        
        portfolio_value = float(account.get('portfolio_value', 0))
        day_pnl = float(account.get('day_trade_pl', 0))
        buying_power = float(account.get('buying_power', 0))
        
        # Portfolio summary alert
        pnl_status = "📈" if day_pnl > 0 else "📉" if day_pnl < 0 else "➡️"
        alerts.append({
            'title': f'💰 Portfolio: ${portfolio_value:,.0f}',
            'message': f'{pnl_status} Day P&L: ${day_pnl:+,.0f} | {len(positions)} positions | ${buying_power:,.0f} buying power',
            'timestamp': datetime.now().isoformat(),
            'severity': 'HIGH' if abs(day_pnl) > 1000 else 'MEDIUM'
        })
        
        # Cash level alert
        if buying_power < 5000:
            alerts.append({
                'title': '💸 Low Buying Power',
                'message': f'Only ${buying_power:,.0f} available - Consider position sizing',
                'timestamp': datetime.now().isoformat(),
                'severity': 'HIGH'
            })
        
        return alerts
    
    def _analyze_risk_levels(self, positions):
        """Analyze position risk levels"""
        alerts = []
        
        high_risk_positions = []
        large_losses = []
        
        for pos in positions:
            symbol = pos['symbol']
            unrealized_pct = float(pos['unrealized_plpc']) * 100
            market_value = float(pos['market_value'])
            unrealized_pnl = float(pos['unrealized_pl'])
            
            # Large position with significant loss
            if market_value > 5000 and unrealized_pct < -10:
                large_losses.append({
                    'symbol': symbol,
                    'loss_pct': unrealized_pct,
                    'loss_amount': unrealized_pnl,
                    'position_size': market_value
                })
            
            # Any position down more than 20%
            if unrealized_pct < -20:
                high_risk_positions.append({
                    'symbol': symbol,
                    'loss_pct': unrealized_pct,
                    'loss_amount': unrealized_pnl
                })
        
        # Generate risk alerts
        if large_losses:
            worst_loss = min(large_losses, key=lambda x: x['loss_pct'])
            alerts.append({
                'title': f'⚠️ Large Loss: {worst_loss["symbol"]}',
                'message': f'{worst_loss["loss_pct"]:.1f}% loss (${worst_loss["loss_amount"]:+,.0f}) - ${worst_loss["position_size"]:,.0f} position',
                'timestamp': datetime.now().isoformat(),
                'severity': 'HIGH'
            })
        
        if high_risk_positions:
            alerts.append({
                'title': f'🚨 High Risk: {len(high_risk_positions)} positions',
                'message': f'Positions down >20% - Review stop losses immediately',
                'timestamp': datetime.now().isoformat(),
                'severity': 'HIGH'
            })
        
        return alerts
    
    def _analyze_performance(self, positions):
        """Analyze position performance"""
        alerts = []
        
        big_winners = []
        for pos in positions:
            unrealized_pct = float(pos['unrealized_plpc']) * 100
            unrealized_pnl = float(pos['unrealized_pl'])
            
            if unrealized_pct > 15:  # Big winner threshold
                big_winners.append({
                    'symbol': pos['symbol'],
                    'gain_pct': unrealized_pct,
                    'gain_amount': unrealized_pnl
                })
        
        if big_winners:
            # Sort by percentage gain
            big_winners.sort(key=lambda x: x['gain_pct'], reverse=True)
            top_winner = big_winners[0]
            
            alerts.append({
                'title': f'🚀 Big Winner: {top_winner["symbol"]}',
                'message': f'{top_winner["gain_pct"]:.1f}% gain (${top_winner["gain_amount"]:+,.0f}) - Consider profit taking',
                'timestamp': datetime.now().isoformat(),
                'severity': 'MEDIUM'
            })
        
        return alerts
    
    def _generate_strategy_alerts(self):
        """Generate market timing and strategy alerts"""
        alerts = []
        current_hour = datetime.now().hour
        
        # Market timing alerts (EST)
        if 7 <= current_hour < 9:  # Pre-market
            alerts.append({
                'title': '🌅 Pre-Market Active',
                'message': 'Review overnight news and prepare for market open',
                'timestamp': datetime.now().isoformat(),
                'severity': 'MEDIUM'
            })
        
        elif 9 <= current_hour < 10:  # Market open
            alerts.append({
                'title': '🔔 Market Open',
                'message': 'High volatility period - Monitor position momentum',
                'timestamp': datetime.now().isoformat(),
                'severity': 'HIGH'
            })
        
        elif 15 <= current_hour < 16:  # Power hour
            alerts.append({
                'title': '⚡ Power Hour Active',
                'message': 'Final hour - High volume, watch for breakouts',
                'timestamp': datetime.now().isoformat(),
                'severity': 'HIGH'
            })
        
        elif 16 <= current_hour < 17:  # After hours
            alerts.append({
                'title': '🌙 After Hours',
                'message': 'Market closed - Review performance and plan tomorrow',
                'timestamp': datetime.now().isoformat(),
                'severity': 'MEDIUM'
            })
        
        return alerts
    
    def get_alerts_for_dashboard(self, max_alerts=5):
        """Get portfolio alerts formatted exactly like existing dashboard alerts"""
        portfolio_alerts = self.generate_portfolio_alerts()
        
        # Sort by severity (HIGH first) and limit
        severity_order = {'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}
        portfolio_alerts.sort(
            key=lambda x: severity_order.get(x.get('severity', 'LOW'), 1), 
            reverse=True
        )
        
        return portfolio_alerts[:max_alerts]

def get_portfolio_intelligence_alerts():
    """Main function to get alerts for dashboard integration"""
    plugin = PortfolioIntelligencePlugin()
    return plugin.get_alerts_for_dashboard()

# Test function
if __name__ == "__main__":
    plugin = PortfolioIntelligencePlugin()
    alerts = plugin.get_alerts_for_dashboard()
    
    print("📱 Portfolio Intelligence Alerts for Dashboard:")
    print("=" * 60)
    
    for alert in alerts:
        severity_emoji = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "⚪"}.get(alert['severity'], "🟡")
        print(f"{severity_emoji} {alert['title']}")
        print(f"   {alert['message']}")
        print(f"   Severity: {alert['severity']} | Time: {alert['timestamp'][:19]}")
        print()
    
    print(f"Generated {len(alerts)} alerts ready for dashboard integration")