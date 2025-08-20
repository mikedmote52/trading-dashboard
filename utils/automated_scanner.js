/**
 * Automated Trading Intelligence Scanner
 * Runs scheduled scans and saves historical data for trend analysis
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const PortfolioIntelligence = require('./portfolio_intelligence');

class AutomatedScanner {
    constructor() {
        this.dataDir = path.join(__dirname, 'historical_data');
        this.isScanning = false;
        this.lastScanTime = null;
        this.scanHistory = [];
        
        // Ensure data directory exists
        this.initializeDataDirectory();
        
        // Start scheduled scanning
        this.startScheduledScanning();
        
        console.log('🤖 Automated scanner initialized');
    }
    
    async initializeDataDirectory() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            
            // Create subdirectories for different data types
            await fs.mkdir(path.join(this.dataDir, 'vigl_scans'), { recursive: true });
            await fs.mkdir(path.join(this.dataDir, 'portfolio_snapshots'), { recursive: true });
            await fs.mkdir(path.join(this.dataDir, 'alerts'), { recursive: true });
            await fs.mkdir(path.join(this.dataDir, 'performance_tracking'), { recursive: true });
            
            console.log('📁 Historical data directories created');
        } catch (error) {
            console.error('Error creating data directories:', error);
        }
    }
    
    startScheduledScanning() {
        // Read scan interval from environment (defaults to 30 minutes)
        const scanIntervalMin = parseInt(process.env.SCAN_INTERVAL_MIN || process.env.ALERTS_MINUTES || 30);
        const scanInterval = scanIntervalMin * 60 * 1000;
        
        console.log(`⏰ Scan interval configured: ${scanIntervalMin} minutes`);
        
        setInterval(async () => {
            const now = new Date();
            const hour = now.getHours();
            const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
            
            // Only scan during extended market hours on weekdays (7 AM - 8 PM EST)
            if (isWeekday && hour >= 7 && hour <= 20) {
                await this.runCompleteScan();
            }
        }, scanInterval);
        
        // Also run an immediate scan on startup
        setTimeout(() => this.runCompleteScan(), 5000);
        
        console.log(`⏰ Scheduled scanning started (every ${scanIntervalMin} minutes during market hours)`);
    }
    
    async runCompleteScan() {
        if (this.isScanning) {
            console.log('📊 Scan already in progress, skipping...');
            return;
        }
        
        this.isScanning = true;
        const scanStartTime = new Date();
        const scanId = `scan_${scanStartTime.getTime()}`;
        
        console.log(`🔍 Starting automated scan: ${scanId}`);
        
        try {
            // 1. Run VIGL Discovery
            const viglResults = await this.runViglDiscovery();
            
            // 2. Get Portfolio Intelligence
            const portfolioIntelligence = new PortfolioIntelligence();
            const portfolioAlerts = await portfolioIntelligence.generatePortfolioAlerts();
            
            // 3. Save all data
            const scanData = {
                scanId,
                timestamp: scanStartTime.toISOString(),
                vigl_discoveries: viglResults,
                portfolio_alerts: portfolioAlerts,
                scan_duration: Date.now() - scanStartTime.getTime()
            };
            
            await this.saveHistoricalData(scanData);
            
            this.lastScanTime = scanStartTime;
            this.scanHistory.push({
                scanId,
                timestamp: scanStartTime.toISOString(),
                discoveries_count: viglResults.length,
                alerts_count: portfolioAlerts.length,
                status: 'SUCCESS'
            });
            
            // Keep only last 100 scan history entries
            if (this.scanHistory.length > 100) {
                this.scanHistory = this.scanHistory.slice(-100);
            }
            
            console.log(`✅ Scan completed: ${viglResults.length} discoveries, ${portfolioAlerts.length} alerts`);
            
        } catch (error) {
            console.error(`❌ Scan failed: ${error.message}`);
            
            this.scanHistory.push({
                scanId,
                timestamp: scanStartTime.toISOString(),
                status: 'FAILED',
                error: error.message
            });
        } finally {
            this.isScanning = false;
        }
    }
    
    async runViglDiscovery() {
        return new Promise((resolve, reject) => {
            console.log('🎯 Running VIGL discovery scan...');
            
            const viglProcess = spawn('python3', ['VIGL_Discovery_Complete.py'], {
                cwd: __dirname,
                env: {
                    ...process.env,
                    POLYGON_API_KEY: 'nTXyESvlVLpQE3hKCJWtsS5BHkhAqq1C'
                }
            });
            
            let outputData = '';
            let errorData = '';
            
            viglProcess.stdout.on('data', (data) => {
                outputData += data.toString();
            });
            
            viglProcess.stderr.on('data', (data) => {
                errorData += data.toString();
            });
            
            viglProcess.on('close', (code) => {
                if (code === 0) {
                    const discoveries = this.parseViglOutput(outputData);
                    console.log(`📈 VIGL scan found ${discoveries.length} patterns`);
                    resolve(discoveries);
                } else {
                    console.error('VIGL scan error:', errorData);
                    reject(new Error(`VIGL scan failed with code ${code}`));
                }
            });
            
            // Timeout after 5 minutes
            setTimeout(() => {
                viglProcess.kill('SIGTERM');
                reject(new Error('VIGL scan timed out'));
            }, 5 * 60 * 1000);
        });
    }
    
    parseViglOutput(output) {
        const discoveries = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            // Look for VIGL MATCH pattern: "🎯 VIGL MATCH: BTAI - 0.76 similarity (4.5x volume, +132.3% momentum)"
            if (line.includes('🎯 VIGL MATCH:')) {
                try {
                    const matchPart = line.split('🎯 VIGL MATCH:')[1].trim();
                    const symbol = matchPart.split(' - ')[0].trim();
                    
                    const similarityMatch = matchPart.match(/([\d.]+) similarity/);
                    const confidence = similarityMatch ? parseFloat(similarityMatch[1]) : 0;
                    
                    const volumeMatch = matchPart.match(/\(([\d.]+)x volume/);
                    const volumeSpike = volumeMatch ? parseFloat(volumeMatch[1]) : 1;
                    
                    const momentumMatch = matchPart.match(/([+-]?[\d.]+)% momentum\)/);
                    const momentum = momentumMatch ? parseFloat(momentumMatch[1]) : 0;
                    
                    discoveries.push({
                        symbol,
                        confidence,
                        volumeSpike,
                        momentum,
                        estimatedUpside: confidence > 0.85 ? '200-400%' : '100-200%',
                        recommendation: confidence > 0.85 ? 'STRONG BUY' : 'BUY',
                        timestamp: new Date().toISOString()
                    });
                } catch (e) {
                    console.error('Error parsing VIGL line:', line, e);
                }
            }
        }
        
        return discoveries;
    }
    
    async saveHistoricalData(scanData) {
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        try {
            // Save VIGL discoveries
            if (scanData.vigl_discoveries.length > 0) {
                const viglFile = path.join(this.dataDir, 'vigl_scans', `vigl_${dateStr}.json`);
                await this.appendToJsonFile(viglFile, {
                    timestamp: scanData.timestamp,
                    scanId: scanData.scanId,
                    discoveries: scanData.vigl_discoveries
                });
            }
            
            // Save portfolio alerts
            if (scanData.portfolio_alerts.length > 0) {
                const alertsFile = path.join(this.dataDir, 'alerts', `alerts_${dateStr}.json`);
                await this.appendToJsonFile(alertsFile, {
                    timestamp: scanData.timestamp,
                    scanId: scanData.scanId,
                    alerts: scanData.portfolio_alerts
                });
            }
            
            // Save complete scan data
            const completeFile = path.join(this.dataDir, `complete_scan_${scanData.scanId}.json`);
            await fs.writeFile(completeFile, JSON.stringify(scanData, null, 2));
            
            console.log(`💾 Historical data saved for scan: ${scanData.scanId}`);
            
        } catch (error) {
            console.error('Error saving historical data:', error);
        }
    }
    
    async appendToJsonFile(filePath, newData) {
        try {
            let existingData = [];
            
            try {
                const fileContent = await fs.readFile(filePath, 'utf8');
                existingData = JSON.parse(fileContent);
            } catch (e) {
                // File doesn't exist or is invalid, start with empty array
                existingData = [];
            }
            
            existingData.push(newData);
            await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
            
        } catch (error) {
            console.error(`Error appending to ${filePath}:`, error);
        }
    }
    
    getScanStatus() {
        return {
            isScanning: this.isScanning,
            lastScanTime: this.lastScanTime,
            scanHistory: this.scanHistory.slice(-10), // Last 10 scans
            historicalDataPath: this.dataDir
        };
    }
    
    async getHistoricalSummary() {
        try {
            const files = await fs.readdir(this.dataDir);
            const summary = {
                totalScans: this.scanHistory.length,
                successfulScans: this.scanHistory.filter(s => s.status === 'SUCCESS').length,
                failedScans: this.scanHistory.filter(s => s.status === 'FAILED').length,
                dataFiles: files.length,
                lastScan: this.lastScanTime,
                dataDirectory: this.dataDir
            };
            
            return summary;
        } catch (error) {
            console.error('Error getting historical summary:', error);
            return null;
        }
    }
}

module.exports = AutomatedScanner;