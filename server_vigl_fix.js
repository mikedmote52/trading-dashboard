// VIGL Discovery function - FIXED VERSION
async function getViglDiscoveries() {
  // Check cache first (2 minute TTL)
  if (lastViglScan && (Date.now() - lastViglScan) < 120000 && viglDiscoveryCache.length > 0) {
    console.log(`✅ Using cached VIGL discoveries: ${viglDiscoveryCache.length} patterns (${Math.round((Date.now() - lastViglScan) / 1000)}s ago)`);
    return viglDiscoveryCache;
  }

  // Set scan in progress flag
  viglScanInProgress = true;
  console.log('📁 Running VIGL Discovery Scanner...');

  try {
    // Run the actual VIGL Python scanner
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    let discoveries = [];
    
    try {
      console.log('🔍 Executing VIGL Discovery scanner...');
      
      // Execute the Python script with JSON output flag
      const { stdout, stderr } = await execPromise('python3 VIGL_Discovery_Complete.py --json', {
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      if (stderr && !stderr.includes('WARNING')) {
        console.error('VIGL scanner stderr:', stderr);
      }
      
      // Parse the JSON output
      const scanResults = JSON.parse(stdout || '[]');
      
      if (scanResults && scanResults.length > 0) {
        discoveries = scanResults;
        console.log(`✅ VIGL scan completed: ${discoveries.length} patterns found`);
        
        // Log top discoveries
        discoveries.slice(0, 3).forEach(d => {
          console.log(`  🎯 ${d.symbol}: ${(d.confidence * 100).toFixed(0)}% confidence, ${d.volumeSpike.toFixed(1)}x volume`);
        });
      } else {
        console.log('📊 VIGL scan completed: No patterns found above threshold');
        discoveries = [];
      }
      
    } catch (scanError) {
      console.error('❌ VIGL scanner execution failed:', scanError.message);
      discoveries = [];
    }
    
    // Enhance discoveries with proper target prices if we have data
    if (discoveries.length > 0) {
      discoveries = discoveries.map(stock => {
        const currentPrice = stock.currentPrice;
        
        // Parse the estimated upside range (e.g., "200-400%" -> [200, 400])
        let minUpside = 100, maxUpside = 200; // defaults
        if (stock.estimatedUpside) {
          const match = stock.estimatedUpside.match(/(\d+)-(\d+)%/);
          if (match) {
            minUpside = parseInt(match[1]);
            maxUpside = parseInt(match[2]);
          }
        }
        
        // Calculate target prices based on upside
        const conservativeTarget = currentPrice * (1 + minUpside / 100);
        const aggressiveTarget = currentPrice * (1 + maxUpside / 100);
        const moderateTarget = (conservativeTarget + aggressiveTarget) / 2;
        
        return {
          ...stock,
          targetPrices: {
            conservative: conservativeTarget,
            moderate: moderateTarget,
            aggressive: aggressiveTarget,
            upside: {
              primary: ((moderateTarget - currentPrice) / currentPrice * 100),
              range: `${minUpside}-${maxUpside}%`
            }
          }
        };
      });
    }
    
    // Cache discoveries
    viglDiscoveryCache = discoveries;
    lastViglScan = Date.now();
    
    // Mark scan as complete
    viglScanInProgress = false;
    console.log('✅ VIGL scan completed - ready for next scan');
    
    // Save to file for backup
    try {
      fs.writeFileSync('vigl_discoveries.json', JSON.stringify(discoveries, null, 2));
      console.log('💾 VIGL discoveries saved to file');
    } catch (e) {
      console.error('Failed to save discoveries:', e);
    }
    
    return discoveries;
    
  } catch (error) {
    console.error('❌ VIGL discovery error:', error);
    viglScanInProgress = false;
    return [];
  }
}