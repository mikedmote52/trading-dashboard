const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { persistDiscoveryBundle, generateInputSignature } = require('../db/discoveries');

// Rate limiting
let lastRunTime = 0;
const MIN_RUN_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Run VIGL discovery scan
 */
async function runVIGLScan(params = {}) {
  const now = Date.now();
  
  // Check rate limit
  if (now - lastRunTime < MIN_RUN_INTERVAL) {
    throw new Error(`Rate limited. Please wait ${Math.ceil((MIN_RUN_INTERVAL - (now - lastRunTime)) / 1000)} seconds.`);
  }
  
  lastRunTime = now;
  
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../VIGL_Discovery_Complete.py');
    const python = spawn('python3', [scriptPath, '--json']);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`VIGL scan failed with code ${code}: ${stderr}`));
      }
      
      try {
        // Parse the output
        const lines = stdout.split('\n');
        const discoveries = [];
        
        // Look for JSON output or parse text format
        let jsonData = null;
        for (const line of lines) {
          if (line.trim().startsWith('{') || line.trim().startsWith('[')) {
            try {
              jsonData = JSON.parse(line);
              break;
            } catch (e) {
              // Not JSON, continue
            }
          }
        }
        
        if (jsonData && Array.isArray(jsonData)) {
          // JSON format
          discoveries.push(...jsonData);
        } else {
          // Parse text format - look for stock entries
          const stockPattern = /\$([A-Z]+)\s+-\s+(.+?)$/;
          const confidencePattern = /VIGL Similarity:\s+([\d.]+)%/;
          const momentumPattern = /Momentum:\s+([+-]?[\d.]+)%/;
          const volumePattern = /Volume:\s+([\d.]+)x/;
          const pricePattern = /Price:\s+\$([\d.]+)/;
          const riskPattern = /Risk:\s+(\w+)/;
          
          let currentStock = null;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for stock symbol
            const stockMatch = line.match(stockPattern);
            if (stockMatch) {
              if (currentStock) {
                discoveries.push(currentStock);
              }
              currentStock = {
                symbol: stockMatch[1],
                name: stockMatch[2].trim(),
                score: 0,
                confidence: 0,
                momentum: 0,
                volume_spike: 0,
                price: 0,
                risk: 'Unknown'
              };
            }
            
            // Extract metrics
            if (currentStock) {
              const confMatch = line.match(confidencePattern);
              if (confMatch) {
                currentStock.confidence = parseFloat(confMatch[1]);
                currentStock.score = currentStock.confidence / 100;
              }
              
              const momMatch = line.match(momentumPattern);
              if (momMatch) {
                currentStock.momentum = parseFloat(momMatch[1]);
              }
              
              const volMatch = line.match(volumePattern);
              if (volMatch) {
                currentStock.volume_spike = parseFloat(volMatch[1]);
              }
              
              const priceMatch = line.match(pricePattern);
              if (priceMatch) {
                currentStock.price = parseFloat(priceMatch[1]);
              }
              
              const riskMatch = line.match(riskPattern);
              if (riskMatch) {
                currentStock.risk = riskMatch[1];
              }
            }
          }
          
          // Add last stock
          if (currentStock) {
            discoveries.push(currentStock);
          }
        }
        
        // Generate bundle
        const runId = crypto.randomBytes(16).toString('hex');
        const scannerVersion = process.env.VIGL_VERSION || '0.1.0';
        
        // Calculate source window
        const endTime = new Date();
        const startTime = new Date(endTime - (params.lookback_minutes || 30) * 60 * 1000);
        const sourceWindow = `${startTime.toLocaleString('en-US', { 
          timeZone: 'America/New_York',
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}–${endTime.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit'
        })} ET`;
        
        const bundle = {
          run_id: runId,
          created_at: Date.now(),
          scanner_version: scannerVersion,
          input_signature: generateInputSignature(params),
          source_window: sourceWindow,
          note: params.note,
          items: discoveries
        };
        
        // Persist to database
        persistDiscoveryBundle(bundle);
        
        resolve({
          run_id: runId,
          status: 'ready',
          count: discoveries.length
        });
        
      } catch (error) {
        reject(new Error(`Failed to parse VIGL output: ${error.message}`));
      }
    });
    
    python.on('error', (error) => {
      reject(new Error(`Failed to spawn VIGL process: ${error.message}`));
    });
  });
}

module.exports = {
  runVIGLScan
};