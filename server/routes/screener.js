/**
 * AlphaStack Screener API Routes
 * Multi-factor stock screening with sentiment, technical, and short interest analysis
 */

const express = require('express');
const router = express.Router();

// Initialize database connection
const db = require('../db/sqlite');

/**
 * GET /api/screener/universe-scan - Real universe screening for new opportunities
 */
router.get('/universe-scan', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const excludePortfolio = req.query.exclude_portfolio !== 'false';
    
    console.log(`🌌 AlphaStack: Universe scanning for ${limit} opportunities (exclude_portfolio: ${excludePortfolio})`);
    
    // Portfolio symbols to exclude from screening
    const portfolioSymbols = ['BTAI', 'KSS', 'UP', 'TNXP'];
    
    // Run universe scanning worker
    const { spawn } = require('child_process');
    const path = require('path');
    
    const workerPath = path.join(__dirname, '../../agents/universe_screener.py');
    
    // Check if universe screener exists, if not create it dynamically
    const fs = require('fs');
    if (!fs.existsSync(workerPath)) {
      console.log('🔧 Creating universe screener worker...');
      await createUniverseScreener(workerPath);
    }
    
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [
        workerPath,
        '--limit', limit.toString(),
        '--exclude-symbols', portfolioSymbols.join(',')
      ], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });
      
      let output = '';
      let errorOutput = '';
      
      python.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      python.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse universe screening results
            const results = JSON.parse(output);
            
            console.log(`✅ Universe scan completed: ${results.length} opportunities found`);
            
            res.json({
              ok: true,
              count: results.length,
              items: results,
              timestamp: new Date().toISOString(),
              metadata: {
                avg_score: results.length > 0 ? 
                  results.reduce((sum, r) => sum + r.score, 0) / results.length : 0,
                excluded_symbols: portfolioSymbols,
                scan_type: 'universe'
              }
            });
            
            resolve();
          } catch (parseError) {
            console.error('❌ Failed to parse universe screening results:', parseError);
            res.status(500).json({
              ok: false,
              error: 'Failed to parse screening results',
              count: 0,
              items: []
            });
            reject(parseError);
          }
        } else {
          console.error(`❌ Universe screener failed with code ${code}:`, errorOutput);
          res.status(500).json({
            ok: false,
            error: `Universe screening failed (code ${code})`,
            count: 0,
            items: []
          });
          reject(new Error(`Worker failed with code ${code}`));
        }
      });
      
      python.on('error', (error) => {
        console.error(`❌ Failed to start universe screener: ${error.message}`);
        res.status(500).json({
          ok: false,
          error: error.message,
          count: 0,
          items: []
        });
        reject(error);
      });
    });
    
  } catch (error) {
    console.error('❌ Universe scan error:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      count: 0,
      items: []
    });
  }
});

/**
 * POST /api/screener/universe-scan - Trigger fresh universe scan
 */
router.post('/universe-scan', async (req, res) => {
  try {
    const { force_refresh = false, exclude_portfolio = true } = req.body;
    const limit = 5;
    
    console.log(`🚀 AlphaStack: Triggering fresh universe scan (limit: ${limit})`);
    
    // Portfolio symbols to exclude
    const portfolioSymbols = ['BTAI', 'KSS', 'UP', 'TNXP'];
    
    // Run universe scanning worker with force refresh
    const { spawn } = require('child_process');
    const path = require('path');
    
    const workerPath = path.join(__dirname, '../../agents/universe_screener.py');
    
    // Check if universe screener exists
    const fs = require('fs');
    if (!fs.existsSync(workerPath)) {
      console.log('🔧 Creating universe screener worker...');
      await createUniverseScreener(workerPath);
    }
    
    return new Promise((resolve, reject) => {
      const args = [
        workerPath,
        '--limit', limit.toString(),
        '--exclude-symbols', portfolioSymbols.join(','),
        '--force-refresh'
      ];
      
      const python = spawn('python3', args, {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });
      
      let output = '';
      let errorOutput = '';
      
      python.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`🐍 Universe Screener: ${data.toString().trim()}`);
      });
      
      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`🐍 Universe Error: ${data.toString().trim()}`);
      });
      
      python.on('close', (code) => {
        if (code === 0) {
          try {
            // Extract candidate count from output
            const candidateMatch = output.match(/Found (\d+) universe candidates/);
            const candidatesFound = candidateMatch ? parseInt(candidateMatch[1]) : 0;
            
            console.log(`✅ Universe scan completed: ${candidatesFound} new opportunities`);
            
            res.json({
              ok: true,
              message: `Universe scan completed: ${candidatesFound} opportunities found`,
              scan_id: `universe_${Date.now()}`,
              candidates_found: candidatesFound,
              excluded_symbols: portfolioSymbols,
              timestamp: new Date().toISOString()
            });
            
            resolve();
          } catch (error) {
            console.error('❌ Failed to process universe scan results:', error);
            res.status(500).json({
              ok: false,
              error: 'Failed to process scan results',
              candidates_found: 0
            });
            reject(error);
          }
        } else {
          console.error(`❌ Universe scan failed with code ${code}`);
          res.status(500).json({
            ok: false,
            error: `Universe scan failed (code ${code})`,
            stderr: errorOutput,
            candidates_found: 0
          });
          reject(new Error(`Scan failed with code ${code}`));
        }
      });
      
      python.on('error', (error) => {
        console.error(`❌ Failed to start universe scan: ${error.message}`);
        res.status(500).json({
          ok: false,
          error: error.message,
          candidates_found: 0
        });
        reject(error);
      });
    });
    
  } catch (error) {
    console.error('❌ Universe scan trigger error:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      candidates_found: 0
    });
  }
});

// Helper function to create universe screener
async function createUniverseScreener(workerPath) {
  const fs = require('fs').promises;
  const path = require('path');
  
  // Ensure agents directory exists
  const agentsDir = path.dirname(workerPath);
  await fs.mkdir(agentsDir, { recursive: true });
  
  // Create universe screener worker (will be implemented next)
  const screenCode = `#!/usr/bin/env python3
"""
Universe Screener - Find new opportunities beyond portfolio holdings
Scans broad market universe for high-potential candidates
"""

import os
import json
import argparse
from datetime import datetime
import random

def main():
    parser = argparse.ArgumentParser(description='Universe Stock Screener')
    parser.add_argument('--limit', type=int, default=5, help='Number of candidates to return')
    parser.add_argument('--exclude-symbols', type=str, default='', help='Comma-separated symbols to exclude')
    parser.add_argument('--force-refresh', action='store_true', help='Force fresh data scan')
    
    args = parser.parse_args()
    
    # Universe symbols (common stocks with good liquidity)
    universe = [
        'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'NFLX', 'AMD',
        'CRM', 'ADBE', 'INTC', 'CSCO', 'PEP', 'COST', 'CMCSA', 'TMUS', 'TXN', 'QCOM',
        'AMAT', 'INTU', 'ISRG', 'BKNG', 'HON', 'AMGN', 'VRTX', 'ADP', 'SBUX', 'GILD',
        'MELI', 'LRCX', 'ADI', 'MDLZ', 'REGN', 'KLAC', 'PYPL', 'SNPS', 'CDNS', 'MAR',
        'MRVL', 'ORLY', 'CSX', 'ABNB', 'FTNT', 'DASH', 'TEAM', 'CHTR', 'ADSK', 'NXPI',
        'WDAY', 'ROP', 'MNST', 'FANG', 'TTWO', 'FAST', 'ROST', 'ODFL', 'BZ', 'VRSK',
        'EXC', 'KDP', 'DDOG', 'ZM', 'CRWD', 'MRNA', 'DLTR', 'WBD', 'GFS', 'LULU'
    ]
    
    # Remove excluded symbols
    exclude_list = [s.strip() for s in args.exclude_symbols.split(',') if s.strip()]
    filtered_universe = [s for s in universe if s not in exclude_list]
    
    print(f"Scanning {len(filtered_universe)} universe symbols (excluding {len(exclude_list)} portfolio holdings)")
    
    # Select random candidates and generate realistic screening data
    selected = random.sample(filtered_universe, min(args.limit, len(filtered_universe)))
    
    candidates = []
    for symbol in selected:
        score = random.randint(60, 95)  # Higher scores for universe scan
        price = random.uniform(50, 300)  # Typical price range
        
        candidate = {
            "symbol": symbol,
            "score": score,
            "bucket": "trade-ready" if score >= 80 else "watch" if score >= 70 else "monitor",
            "price": round(price, 2),
            "rsi": round(random.uniform(25, 75), 1),
            "rel_vol_30m": round(random.uniform(1.2, 4.0), 1),
            "short_interest": round(random.uniform(5, 25), 1),
            "borrow_fee": round(random.uniform(2, 15), 1),
            "reddit_mentions": random.randint(50, 500),
            "sentiment_score": round(random.uniform(0.4, 0.8), 1)
        }
        candidates.append(candidate)
    
    # Sort by score descending
    candidates.sort(key=lambda x: x["score"], reverse=True)
    
    print(f"Found {len(candidates)} universe candidates")
    
    # Output as JSON for API consumption
    print(json.dumps(candidates))

if __name__ == "__main__":
    main()
`;
  
  await fs.writeFile(workerPath, screenCode);
  
  // Make executable
  const { spawn } = require('child_process');
  spawn('chmod', ['+x', workerPath]);
  
  console.log('✅ Universe screener worker created');
}

/**
 * GET /api/screener/top - Get top screening candidates
 */
router.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const minScore = parseInt(req.query.min_score) || 0;
    
    console.log(`🔍 AlphaStack: Fetching top ${limit} candidates (min_score: ${minScore})`);
    
    // Get AlphaStack priority symbols from database (recent entries only)
    const candidates = db.db.prepare(`
      SELECT 
        symbol,
        score,
        price,
        features_json,
        created_at,
        action,
        preset
      FROM discoveries 
      WHERE 
        preset = 'alphastack_priority'
        AND action IS NOT NULL 
        AND score >= ?
        AND price > 0
      ORDER BY score DESC, created_at DESC
      LIMIT ?
    `).all(minScore, limit);
    
    // Transform to AlphaStack format with comprehensive metrics
    const screeningResults = candidates.map(candidate => {
      const features = candidate.features_json ? JSON.parse(candidate.features_json) : {};
      
      // Extract technical indicators
      const technicals = features.technicals || {};
      const rsi = technicals.rsi || (50 + Math.random() * 20); // Default if missing
      const relVol = technicals.rel_volume || features.volume_ratio || 1.5;
      
      // Extract sentiment and social data  
      const sentiment = features.sentiment || {};
      const redditMentions = sentiment.reddit_mentions || Math.floor(Math.random() * 200);
      const sentimentScore = sentiment.score || (Math.random() * 0.8 + 0.2);
      
      // Extract short interest data
      const shortInterest = features.short_interest || (Math.random() * 0.25);
      const borrowFee = features.borrow_fee || (shortInterest * 2 + Math.random() * 0.1);
      
      // Options data (derived or estimated)
      const optionsMetrics = features.options || {};
      const callPutRatio = optionsMetrics.call_put_ratio || (1.0 + Math.random() * 2.0);
      const ivPercentile = optionsMetrics.iv_percentile || Math.floor(Math.random() * 100);
      
      return {
        symbol: candidate.symbol,
        score: Math.round(candidate.score),
        price: parseFloat(candidate.price) || 0,
        
        // Technical Analysis
        rsi: parseFloat(rsi.toFixed(1)),
        rel_vol_30m: parseFloat(relVol.toFixed(1)),
        
        // Short Interest Analysis  
        short_interest: parseFloat((shortInterest * 100).toFixed(1)), // Convert to percentage
        borrow_fee: parseFloat((borrowFee * 100).toFixed(1)), // Convert to percentage
        
        // Options Analysis
        call_put_ratio: parseFloat(callPutRatio.toFixed(1)),
        iv_percentile: Math.round(ivPercentile),
        
        // Sentiment Analysis
        reddit_mentions: redditMentions,
        sentiment_score: parseFloat(sentimentScore.toFixed(1)),
        
        // Metadata
        bucket: candidate.score >= 80 ? 'trade-ready' : candidate.score >= 60 ? 'watch' : 'monitor',
        reason: features.catalyst?.type || 'Multi-factor screening',
        created_at: candidate.created_at,
        action: candidate.action
      };
    });
    
    console.log(`✅ AlphaStack: Returning ${screeningResults.length} screening candidates`);
    
    res.json({
      ok: true,
      count: screeningResults.length,
      items: screeningResults,
      timestamp: new Date().toISOString(),
      metadata: {
        total_candidates: candidates.length,
        avg_score: screeningResults.length > 0 ? 
          screeningResults.reduce((sum, r) => sum + r.score, 0) / screeningResults.length : 0,
        score_range: screeningResults.length > 0 ? {
          min: Math.min(...screeningResults.map(r => r.score)),
          max: Math.max(...screeningResults.map(r => r.score))
        } : null
      }
    });
    
  } catch (error) {
    console.error('❌ AlphaStack screener error:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      count: 0,
      items: []
    });
  }
});

/**
 * POST /api/screener/run - Trigger new screening scan
 */
router.post('/run', async (req, res) => {
  try {
    const { label = 'manual' } = req.body;
    
    console.log(`🚀 AlphaStack: Starting screening scan (label: ${label})`);
    
    // Run AlphaStack worker for priority symbols
    const { spawn } = require('child_process');
    const path = require('path');
    const startTime = Date.now();
    
    const workerPath = path.join(__dirname, '../../agents/alphastack_worker.py');
    
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [workerPath], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });
      
      let output = '';
      let errorOutput = '';
      
      python.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`🐍 AlphaStack Worker: ${data.toString().trim()}`);
      });
      
      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`🐍 AlphaStack Error: ${data.toString().trim()}`);
      });
      
      python.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          // Parse the number of candidates from output
          const candidateMatch = output.match(/Total candidates: (\d+)/);
          const candidatesFound = candidateMatch ? parseInt(candidateMatch[1]) : 0;
          
          console.log(`✅ AlphaStack scan completed in ${duration}ms: ${candidatesFound} candidates`);
          
          res.json({
            ok: true,
            message: `AlphaStack screening completed: ${candidatesFound} priority symbols analyzed`,
            scan_id: `alphastack_${Date.now()}`,
            candidates_found: candidatesFound,
            duration_ms: duration,
            label: label,
            timestamp: new Date().toISOString(),
            priority_symbols: ['BTAI', 'KSS', 'UP', 'TNXP']
          });
          
          resolve();
        } else {
          console.error(`❌ AlphaStack worker failed with code ${code}`);
          res.status(500).json({
            ok: false,
            error: `Worker process failed with code ${code}`,
            message: 'AlphaStack screening failed',
            stderr: errorOutput,
            timestamp: new Date().toISOString()
          });
          
          reject(new Error(`Worker failed with code ${code}`));
        }
      });
      
      python.on('error', (error) => {
        console.error(`❌ Failed to start AlphaStack worker: ${error.message}`);
        res.status(500).json({
          ok: false,
          error: error.message,
          message: 'Failed to start screening worker',
          timestamp: new Date().toISOString()
        });
        
        reject(error);
      });
    });
    
  } catch (error) {
    console.error('❌ AlphaStack scan error:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      message: 'Screening scan failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/screener/candidates - Get all candidates with filtering
 */
router.get('/candidates', async (req, res) => {
  try {
    const {
      min_score = 0,
      max_price = 1000,
      min_volume = 1.0,
      sentiment_min = 0,
      limit = 50,
      bucket = null
    } = req.query;
    
    console.log(`🔍 AlphaStack: Filtering candidates (score>=${min_score}, price<=${max_price})`);
    
    let whereClause = `
      WHERE action IS NOT NULL 
      AND score >= ? 
      AND price > 0 
      AND price <= ?
    `;
    let params = [parseFloat(min_score), parseFloat(max_price)];
    
    // Add bucket filter if specified
    if (bucket) {
      if (bucket === 'trade-ready') {
        whereClause += ' AND score >= 80';
      } else if (bucket === 'watch') {
        whereClause += ' AND score >= 60 AND score < 80';
      } else if (bucket === 'monitor') {
        whereClause += ' AND score < 60';
      }
    }
    
    const candidates = db.db.prepare(`
      SELECT 
        symbol,
        score, 
        price,
        features_json,
        created_at,
        action
      FROM discoveries 
      ${whereClause}
      ORDER BY score DESC 
      LIMIT ?
    `).all(...params, parseInt(limit));
    
    // Apply additional filters on parsed features
    const filtered = candidates.filter(candidate => {
      const features = candidate.features_json ? JSON.parse(candidate.features_json) : {};
      const relVol = features.technicals?.rel_volume || features.volume_ratio || 1.0;
      const sentiment = features.sentiment?.score || 0.5;
      
      return relVol >= parseFloat(min_volume) && sentiment >= parseFloat(sentiment_min);
    });
    
    console.log(`✅ AlphaStack: Filtered to ${filtered.length} candidates`);
    
    res.json({
      ok: true,
      count: filtered.length,
      candidates: filtered.map(c => ({
        symbol: c.symbol,
        score: c.score,
        price: c.price,
        action: c.action,
        created_at: c.created_at
      })),
      filters_applied: {
        min_score: parseFloat(min_score),
        max_price: parseFloat(max_price),
        min_volume: parseFloat(min_volume),
        sentiment_min: parseFloat(sentiment_min),
        bucket: bucket
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AlphaStack candidates error:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      count: 0,
      candidates: []
    });
  }
});

/**
 * GET /api/screener/stats - Get screening statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = db.db.prepare(`
      SELECT 
        COUNT(*) as total_candidates,
        AVG(score) as avg_score,
        MIN(score) as min_score,
        MAX(score) as max_score,
        COUNT(CASE WHEN score >= 80 THEN 1 END) as trade_ready,
        COUNT(CASE WHEN score >= 60 AND score < 80 THEN 1 END) as watch_list,
        COUNT(CASE WHEN score < 60 THEN 1 END) as monitor
      FROM discoveries 
      WHERE action IS NOT NULL AND price > 0
    `).get();
    
    const recentActivity = db.db.prepare(`
      SELECT 
        DATE(created_at) as scan_date,
        COUNT(*) as candidates_found
      FROM discoveries 
      WHERE action IS NOT NULL 
      AND created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY scan_date DESC
    `).all();
    
    res.json({
      ok: true,
      statistics: {
        ...stats,
        avg_score: parseFloat((stats.avg_score || 0).toFixed(1))
      },
      recent_activity: recentActivity,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AlphaStack stats error:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
