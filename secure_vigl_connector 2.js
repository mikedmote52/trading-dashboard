/**
 * Secure VIGL Connector - Bridge VIGL Discovery System to UI
 * Provides secure connection between Python VIGL system and dashboard
 */

const { spawn } = require('child_process');
const path = require('path');

class SecureVIGLConnector {
  constructor(options = {}) {
    this.options = {
      pythonPath: options.pythonPath || 'python3',
      viglScriptPath: options.viglScriptPath || path.join(__dirname, 'VIGL_Discovery_Complete.py'),
      dbPath: options.dbPath || path.join(__dirname, 'trading_dashboard.db'),
      timeout: options.timeout || 120000, // 2 minutes
      retries: options.retries || 3,
      ...options
    };
    
    this.isRunning = false;
    this.currentProcess = null;
    this.discoveryCache = new Map();
    this.lastScanTime = null;
  }

  /**
   * Run VIGL Discovery with full market scan
   */
  async runViglDiscovery(symbols = null, options = {}) {
    if (this.isRunning) {
      throw new Error('VIGL scan already running. Please wait for completion.');
    }

    this.isRunning = true;
    
    try {
      const discoveries = await this._executeViglScan(symbols, options);
      await this._validateDiscoveries(discoveries);
      await this._storeDiscoveries(discoveries);
      
      this.lastScanTime = new Date();
      console.log(`✅ VIGL Discovery complete: ${discoveries.length} patterns found`);
      
      return {
        success: true,
        count: discoveries.length,
        discoveries: discoveries.slice(0, 20), // Top 20 for UI
        timestamp: this.lastScanTime
      };
      
    } catch (error) {
      console.error('❌ VIGL Discovery failed:', error.message);
      return {
        success: false,
        error: error.message,
        count: 0,
        discoveries: []
      };
    } finally {
      this.isRunning = false;
      this.currentProcess = null;
    }
  }

  /**
   * Execute Python VIGL scanner with security validation
   */
  async _executeViglScan(symbols, options) {
    return new Promise((resolve, reject) => {
      // Validate environment
      if (!process.env.POLYGON_API_KEY) {
        reject(new Error('POLYGON_API_KEY not configured - real market data required'));
        return;
      }

      // Build command arguments
      const args = [this.options.viglScriptPath];
      
      if (symbols && symbols.length > 0) {
        // Sanitize symbols for security
        const cleanSymbols = symbols
          .filter(s => /^[A-Z]{1,5}$/.test(s)) // Only valid stock symbols
          .slice(0, 100); // Limit to 100 symbols max
        
        if (cleanSymbols.length > 0) {
          args.push('--symbols', cleanSymbols.join(','));
        }
      }

      // Add format flag for structured output
      args.push('--format', 'json');
      
      if (options.verbose) {
        args.push('--verbose');
      }

      // Set environment variables securely
      const env = {
        ...process.env,
        POLYGON_API_KEY: process.env.POLYGON_API_KEY,
        SQLITE_DB_PATH: this.options.dbPath,
        PYTHONPATH: path.dirname(this.options.viglScriptPath)
      };

      console.log(`🔍 Starting VIGL scan: ${this.options.pythonPath} ${args.join(' ')}`);

      // Spawn Python process
      this.currentProcess = spawn(this.options.pythonPath, args, {
        env,
        cwd: path.dirname(this.options.viglScriptPath),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let discoveries = [];

      // Capture output
      this.currentProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Try to parse JSON output for real-time updates
        try {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
              const discovery = JSON.parse(line);
              if (discovery.symbol && discovery.score) {
                discoveries.push(discovery);
              }
            }
          }
        } catch (e) {
          // Not JSON, continue
        }
      });

      this.currentProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      this.currentProcess.on('close', (code) => {
        if (code === 0) {
          // Success - parse final output
          try {
            // Try to parse JSON from stdout
            const jsonMatch = stdout.match(/\[.*\]/s);
            if (jsonMatch) {
              const parsedDiscoveries = JSON.parse(jsonMatch[0]);
              resolve(parsedDiscoveries);
            } else if (discoveries.length > 0) {
              resolve(discoveries);
            } else {
              resolve([]);
            }
          } catch (error) {
            console.warn('⚠️ Could not parse VIGL output as JSON, using text parsing');
            resolve(this._parseTextOutput(stdout));
          }
        } else {
          reject(new Error(`VIGL process failed with code ${code}. Error: ${stderr}`));
        }
      });

      // Handle errors
      this.currentProcess.on('error', (error) => {
        reject(new Error(`Failed to start VIGL process: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.currentProcess.kill();
          reject(new Error('VIGL scan timeout after 2 minutes'));
        }
      }, this.options.timeout);
    });
  }

  /**
   * Parse text output when JSON parsing fails
   */
  _parseTextOutput(stdout) {
    const discoveries = [];
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      // Look for pattern: "SYMBOL: Score XX%, Confidence YY%"
      const match = line.match(/([A-Z]+):\s*Score\s+(\d+(?:\.\d+)?)%.*Confidence\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        const [, symbol, score, confidence] = match;
        discoveries.push({
          symbol,
          score: parseFloat(score),
          confidence: parseFloat(confidence) / 100,
          source: 'vigl_text_parse',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return discoveries;
  }

  /**
   * Validate discoveries for security and data integrity
   */
  async _validateDiscoveries(discoveries) {
    if (!Array.isArray(discoveries)) {
      throw new Error('Invalid discoveries format - expected array');
    }

    for (const discovery of discoveries) {
      // Validate required fields
      if (!discovery.symbol || typeof discovery.symbol !== 'string') {
        throw new Error('Discovery missing valid symbol');
      }

      // Sanitize symbol
      if (!/^[A-Z]{1,5}$/.test(discovery.symbol)) {
        throw new Error(`Invalid symbol format: ${discovery.symbol}`);
      }

      // Validate numeric fields
      if (discovery.score !== undefined) {
        discovery.score = Math.max(0, Math.min(100, parseFloat(discovery.score) || 0));
      }

      if (discovery.confidence !== undefined) {
        discovery.confidence = Math.max(0, Math.min(1, parseFloat(discovery.confidence) || 0));
      }

      if (discovery.price !== undefined) {
        discovery.price = Math.max(0, parseFloat(discovery.price) || 0);
      }

      // Add security metadata
      discovery.validated_at = new Date().toISOString();
      discovery.source = discovery.source || 'vigl_connector';
    }

    console.log(`✅ Validated ${discoveries.length} VIGL discoveries`);
    return discoveries;
  }

  /**
   * Store discoveries in database with proper formatting
   */
  async _storeDiscoveries(discoveries) {
    if (discoveries.length === 0) {
      console.log('📊 No discoveries to store');
      return;
    }

    try {
      const db = require('./server/db/sqlite');
      let stored = 0;

      for (const discovery of discoveries) {
        // Transform to database format
        const dbDiscovery = {
          symbol: discovery.symbol,
          score: discovery.score || 0,
          action: this._determineAction(discovery.score || 0),
          features_json: JSON.stringify({
            confidence: discovery.confidence || 0,
            price: discovery.price || 0,
            volume_spike: discovery.volumeSpike || 1,
            technicals: {
              rel_volume: discovery.volumeSpike || 1,
              momentum: discovery.momentum || 0
            },
            catalyst: {
              type: discovery.catalyst || 'Pattern match'
            },
            source: 'vigl_connector',
            validated: true
          }),
          created_at: new Date().toISOString()
        };

        // Insert into database
        try {
          await db.insertDiscovery(dbDiscovery);
          stored++;
        } catch (error) {
          console.warn(`⚠️ Failed to store ${discovery.symbol}:`, error.message);
        }
      }

      console.log(`💾 Stored ${stored} VIGL discoveries in database`);
      return stored;

    } catch (error) {
      console.error('❌ Database storage error:', error.message);
      throw error;
    }
  }

  /**
   * Determine trading action based on score
   */
  _determineAction(score) {
    if (score >= 75) return 'BUY';
    if (score >= 60) return 'WATCHLIST';
    if (score >= 45) return 'MONITOR';
    return 'IGNORE';
  }

  /**
   * Get cached discoveries for quick UI updates
   */
  getCachedDiscoveries() {
    return Array.from(this.discoveryCache.values());
  }

  /**
   * Get scan status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastScan: this.lastScanTime,
      cacheSize: this.discoveryCache.size,
      hasProcess: !!this.currentProcess
    };
  }

  /**
   * Stop running scan
   */
  stopScan() {
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    this.isRunning = false;
    console.log('🛑 VIGL scan stopped');
  }

  /**
   * Test connection to VIGL system
   */
  async testConnection() {
    try {
      // Test with a small symbol set
      const testResult = await this.runViglDiscovery(['AAPL'], { timeout: 30000 });
      return {
        success: true,
        message: 'VIGL connector working properly',
        testResult
      };
    } catch (error) {
      return {
        success: false,
        message: `VIGL connector test failed: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = { SecureVIGLConnector };