#!/usr/bin/env python3
"""
Cold Tape Recovery Scanner
Fallback scanner for when normal VIGL discovery returns 0 candidates
Uses relaxed parameters to find opportunities during quiet market periods
"""

import os
import sys
import json
import pandas as pd
import numpy as np
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

# Import the universe screener
from agents.universe_screener import UniverseScreener

class ColdTapeRecovery:
    def __init__(self):
        self.screener = UniverseScreener()
        print("🥶 ColdTape Recovery: Initialized for quiet market conditions")
    
    def relaxed_scan(self, limit=10):
        """Run relaxed scan with lowered thresholds"""
        try:
            print("🔍 ColdTape: Running relaxed parameter scan...")
            
            # Get the original configuration
            original_criteria = self.screener.criteria.copy()
            original_target = self.screener.shortlist_target
            original_min = self.screener.shortlist_min
            
            # Relax the criteria for cold tape conditions
            self.screener.criteria["min_price"] = 0.50  # Lower minimum price
            self.screener.shortlist_target = 300  # Larger initial pool
            self.screener.shortlist_min = 150
            
            print(f"🔧 ColdTape: Relaxed criteria - Min price: ${self.screener.criteria['min_price']}, Target: {self.screener.shortlist_target}")
            
            # Run the scan with relaxed parameters
            candidates = self.screener.screen_universe(limit=limit * 2)  # Get more candidates
            
            # Restore original criteria
            self.screener.criteria = original_criteria
            self.screener.shortlist_target = original_target
            self.screener.shortlist_min = original_min
            
            if candidates:
                # Apply cold tape bonus scoring
                enhanced_candidates = self.apply_cold_tape_scoring(candidates)
                
                # Sort by enhanced score and return top candidates
                enhanced_candidates.sort(key=lambda x: x['score'], reverse=True)
                final_candidates = enhanced_candidates[:limit]
                
                print(f"✅ ColdTape: Found {len(final_candidates)} candidates with relaxed parameters")
                return {
                    "candidates": final_candidates,
                    "scan_mode": "cold_tape_recovery",
                    "note": f"Relaxed scanning found {len(final_candidates)} opportunities during quiet market"
                }
            else:
                print("❄️ ColdTape: Even relaxed scan found no candidates")
                return {
                    "candidates": [],
                    "scan_mode": "cold_tape_failed",
                    "note": "Extremely quiet market - no opportunities found even with relaxed parameters"
                }
                
        except Exception as error:
            print(f"❌ ColdTape Error: {error}")
            return {
                "candidates": [],
                "scan_mode": "error",
                "note": f"Cold tape recovery failed: {str(error)}"
            }
    
    def apply_cold_tape_scoring(self, candidates):
        """Apply bonus scoring for cold tape conditions"""
        enhanced = []
        
        for candidate in candidates:
            # Copy the original candidate
            enhanced_candidate = candidate.copy()
            
            # Apply cold tape bonuses
            cold_tape_bonus = 0
            
            # Bonus for any momentum in quiet market
            if enhanced_candidate.get('rel_vol_30m', 0) >= 1.2:  # Even 1.2x volume is good in cold tape
                cold_tape_bonus += 5
                
            # Bonus for being near 52-week lows (contrarian play)
            if enhanced_candidate.get('price', 0) < 5.0:  # Low price stocks often move first
                cold_tape_bonus += 3
                
            # Bonus for decent score in quiet conditions
            if enhanced_candidate.get('score', 0) >= 60:  # Lower bar during cold tape
                cold_tape_bonus += 5
                
            # Apply the bonus
            original_score = enhanced_candidate.get('score', 50)
            enhanced_candidate['score'] = min(100, original_score + cold_tape_bonus)
            enhanced_candidate['cold_tape_bonus'] = cold_tape_bonus
            enhanced_candidate['original_score'] = original_score
            
            # Update action based on enhanced score
            if enhanced_candidate['score'] >= 75:
                enhanced_candidate['action'] = 'EARLY_READY'
            elif enhanced_candidate['score'] >= 65:
                enhanced_candidate['action'] = 'PRE_BREAKOUT'  
            else:
                enhanced_candidate['action'] = 'WATCHLIST'
            
            enhanced.append(enhanced_candidate)
            
        return enhanced

def main():
    """Main execution function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Cold Tape Recovery Scanner')
    parser.add_argument('--limit', type=int, default=5, help='Number of candidates to return')
    parser.add_argument('--quiet', action='store_true', help='Suppress output')
    
    args = parser.parse_args()
    
    # Create recovery scanner
    recovery = ColdTapeRecovery()
    
    # Run relaxed scan
    result = recovery.relaxed_scan(limit=args.limit)
    
    # Output results
    if not args.quiet:
        print(f"\n🥶 COLD TAPE RECOVERY RESULTS", file=sys.stderr)
        print(f"Mode: {result['scan_mode']}", file=sys.stderr)
        print(f"Note: {result['note']}", file=sys.stderr)
        print(f"Candidates: {len(result['candidates'])}", file=sys.stderr)
        
        if result['candidates']:
            print("\nTop Candidates:", file=sys.stderr)
            for i, c in enumerate(result['candidates'][:3], 1):
                bonus = c.get('cold_tape_bonus', 0)
                print(f"  {i}. {c['symbol']}: {c['score']} pts (+{bonus} cold bonus), Action: {c['action']}", file=sys.stderr)
    
    # Output JSON for API consumption
    print(json.dumps(result['candidates']))

if __name__ == "__main__":
    main()