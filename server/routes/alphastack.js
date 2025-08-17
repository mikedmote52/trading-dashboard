const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

function parseScreenerOutput(output) {
  try {
    // Extract JSON from output (universe screener prints to stdout)
    const lines = output.split('\n');
    console.log('🔍 All output lines:', lines.map((line, i) => `${i}: ${line.substring(0, 50)}...`));
    const jsonLine = lines.find(line => line.trim().startsWith('['));
    
    if (jsonLine) {
      const candidates = JSON.parse(jsonLine);
      return candidates.map(candidate => ({
        symbol: candidate.symbol,
        score: candidate.score,
        bucket: candidate.bucket || 'monitor',
        price: candidate.price,
        rel_vol: candidate.rel_vol_30m,  // Remove fake default
        rel_vol_30m: candidate.rel_vol_30m,  // Keep original field name too
        short_interest: candidate.short_interest,
        borrow_fee: candidate.borrow_fee,
        utilization: candidate.utilization,
        thesis: candidate.thesis,
        target_price: candidate.target_price,
        upside_pct: candidate.upside_pct,
        risk_note: candidate.risk_note
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing screener output:', error);
    return [];
  }
}

router.get('/scan', async (req, res) => {
  try {
    const limit = req.query.limit || 5;
    const excludeSymbols = "BTAI,KSS,UP,TNXP"; // Current holdings
    
    console.log(`🔍 AlphaStack: Starting universe scan for ${limit} opportunities...`);
    
    // Run the universe screener
    const python = spawn('python3', [
      path.join(__dirname, '../../agents/universe_screener.py'),
      '--limit', limit,
      '--exclude-symbols', excludeSymbols
    ], {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env }  // Pass environment variables
    });
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log('📊 Universe Scanner:', data.toString().trim());
    });
    
    python.on('close', (code) => {
      console.log(`🔍 Python process closed with code: ${code}`);
      console.log('🔍 Raw stdout length:', output.length);
      console.log('🔍 Raw stderr length:', errorOutput.length);
      
      if (code === 0) {
        console.log('🔍 Raw screener output:', output.substring(0, 300) + '...');
        const candidates = parseScreenerOutput(output);
        console.log('📊 Parsed candidates count:', candidates.length);
        if (candidates.length > 0) {
          console.log('📊 Parsed candidates sample:', JSON.stringify(candidates[0], null, 2));
        }
        
        if (candidates.length > 0) {
          console.log(`✅ AlphaStack: Found ${candidates.length} new opportunities`);
          res.json({ 
            success: true, 
            candidates,
            timestamp: new Date().toISOString(),
            count: candidates.length
          });
        } else {
          console.log('⚠️ AlphaStack: No candidates found');
          res.json({ 
            success: true, 
            candidates: [],
            message: 'No new opportunities found'
          });
        }
      } else {
        console.error('❌ AlphaStack screener failed with code:', code);
        console.error('Error output:', errorOutput);
        res.status(500).json({ 
          success: false, 
          error: 'Universe screener failed',
          details: errorOutput
        });
      }
    });
    
    python.on('error', (error) => {
      console.error('❌ Failed to start universe screener:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to start screener process',
        details: error.message
      });
    });
    
  } catch (error) {
    console.error('❌ AlphaStack API error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'AlphaStack Universe Scanner',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;