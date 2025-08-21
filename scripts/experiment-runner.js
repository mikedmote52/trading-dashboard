#!/usr/bin/env node

// AlphaStack Discovery Experiment Runner
// Compare v1 (stable) vs v2 (experimental) performance

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EXPERIMENT_DIR = 'experiments';
const CONFIG_DIR = 'config';

class ExperimentRunner {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(EXPERIMENT_DIR)) {
      fs.mkdirSync(EXPERIMENT_DIR, { recursive: true });
    }
    ['v1', 'v2', 'comparisons'].forEach(dir => {
      const fullPath = path.join(EXPERIMENT_DIR, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  async runComparison(seed = 1337, limit = 50) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runId = `${timestamp}-${seed}`;
    
    console.log(`🧪 Starting experiment: ${runId}`);
    console.log(`📊 Parameters: seed=${seed}, limit=${limit}`);

    try {
      // Run v1 (stable baseline)
      console.log('🔵 Running v1 (stable)...');
      const v1Results = await this.runVersion('v1', {
        seed,
        limit,
        engine: 'python_v2',
        config: null // Use default v1 settings
      });

      // Run v2 (experimental)
      console.log('🟡 Running v2 (experimental)...');
      const v2Results = await this.runVersion('v2', {
        seed,
        limit,
        engine: 'python_v2',
        config: path.join(CONFIG_DIR, 'discovery.yaml')
      });

      // Compare results
      const comparison = this.compareResults(v1Results, v2Results, runId);
      
      // Save experiment data
      this.saveExperiment(runId, {
        v1: v1Results,
        v2: v2Results,
        comparison
      });

      console.log(`✅ Experiment complete: ${runId}`);
      this.printComparison(comparison);

      return comparison;

    } catch (error) {
      console.error(`❌ Experiment failed: ${error.message}`);
      throw error;
    }
  }

  async runVersion(version, params) {
    const outputFile = path.join(EXPERIMENT_DIR, version, `${Date.now()}.json`);
    
    // Build command
    const args = [
      'agents/universe_screener_v2.py',
      '--seed', params.seed.toString(),
      '--limit', params.limit.toString(),
      '--json-out'
    ];

    if (params.config) {
      args.push('--config', params.config);
    }

    // Run screener
    const result = await this.executeCommand('python3', args);
    
    if (!result.stdout) {
      throw new Error(`No output from ${version} screener`);
    }

    try {
      const data = JSON.parse(result.stdout);
      
      // Save raw output
      fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
      
      return {
        version,
        timestamp: new Date().toISOString(),
        outputFile,
        data,
        metrics: this.calculateMetrics(data)
      };
    } catch (parseError) {
      throw new Error(`Failed to parse ${version} output: ${parseError.message}`);
    }
  }

  compareResults(v1Results, v2Results, runId) {
    const v1Items = v1Results.data.items || [];
    const v2Items = v2Results.data.items || [];
    
    const comparison = {
      runId,
      timestamp: new Date().toISOString(),
      v1: {
        count: v1Items.length,
        tickers: v1Items.map(item => item.ticker || item.symbol),
        avgScore: this.averageScore(v1Items),
        topScore: this.topScore(v1Items),
        metrics: v1Results.metrics
      },
      v2: {
        count: v2Items.length,
        tickers: v2Items.map(item => item.ticker || item.symbol),
        avgScore: this.averageScore(v2Items),
        topScore: this.topScore(v2Items),
        metrics: v2Results.metrics
      },
      differences: {},
      determinism: {}
    };

    // Calculate differences
    comparison.differences = {
      countDelta: comparison.v2.count - comparison.v1.count,
      avgScoreDelta: comparison.v2.avgScore - comparison.v1.avgScore,
      topScoreDelta: comparison.v2.topScore - comparison.v1.topScore,
      uniqueToV1: comparison.v1.tickers.filter(t => !comparison.v2.tickers.includes(t)),
      uniqueToV2: comparison.v2.tickers.filter(t => !comparison.v1.tickers.includes(t)),
      overlap: comparison.v1.tickers.filter(t => comparison.v2.tickers.includes(t))
    };

    // Check determinism (same seed should produce identical results)
    comparison.determinism = {
      identical: JSON.stringify(v1Items) === JSON.stringify(v2Items),
      sameOrder: comparison.v1.tickers.join(',') === comparison.v2.tickers.join(','),
      overlapPercent: comparison.differences.overlap.length / Math.max(comparison.v1.count, comparison.v2.count)
    };

    return comparison;
  }

  calculateMetrics(data) {
    const items = data.items || [];
    return {
      totalCount: items.length,
      averageScore: this.averageScore(items),
      topScore: this.topScore(items),
      scoreDistribution: this.scoreDistribution(items),
      alphabetDiversity: this.alphabetDiversity(items),
      priceDistribution: this.priceDistribution(items)
    };
  }

  averageScore(items) {
    if (!items.length) return 0;
    return items.reduce((sum, item) => sum + (item.score || 0), 0) / items.length;
  }

  topScore(items) {
    if (!items.length) return 0;
    return Math.max(...items.map(item => item.score || 0));
  }

  scoreDistribution(items) {
    const ranges = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '<60': 0 };
    items.forEach(item => {
      const score = item.score || 0;
      if (score >= 90) ranges['90-100']++;
      else if (score >= 80) ranges['80-89']++;
      else if (score >= 70) ranges['70-79']++;
      else if (score >= 60) ranges['60-69']++;
      else ranges['<60']++;
    });
    return ranges;
  }

  alphabetDiversity(items) {
    const letters = new Set(items.map(item => (item.ticker || item.symbol || '').charAt(0)));
    return letters.size;
  }

  priceDistribution(items) {
    const ranges = { '<$2': 0, '$2-5': 0, '$5-20': 0, '>$20': 0 };
    items.forEach(item => {
      const price = item.price || 0;
      if (price < 2) ranges['<$2']++;
      else if (price < 5) ranges['$2-5']++;
      else if (price < 20) ranges['$5-20']++;
      else ranges['>$20']++;
    });
    return ranges;
  }

  saveExperiment(runId, data) {
    const filepath = path.join(EXPERIMENT_DIR, 'comparisons', `${runId}.json`);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 Experiment saved: ${filepath}`);
  }

  printComparison(comparison) {
    console.log('\\n📊 COMPARISON RESULTS:');
    console.log(`V1: ${comparison.v1.count} items, avg score ${comparison.v1.avgScore.toFixed(1)}`);
    console.log(`V2: ${comparison.v2.count} items, avg score ${comparison.v2.avgScore.toFixed(1)}`);
    console.log(`Δ Count: ${comparison.differences.countDelta}`);
    console.log(`Δ Avg Score: ${comparison.differences.avgScoreDelta.toFixed(1)}`);
    console.log(`Overlap: ${comparison.differences.overlap.length}/${Math.max(comparison.v1.count, comparison.v2.count)}`);
    console.log(`Alphabet Diversity: V1=${comparison.v1.metrics.alphabetDiversity}, V2=${comparison.v2.metrics.alphabetDiversity}`);
    console.log(`Determinism: ${comparison.determinism.identical ? '✅' : '❌'}`);
  }

  async executeCommand(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
    });
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const seed = parseInt(args[0]) || 1337;
  const limit = parseInt(args[1]) || 50;

  const runner = new ExperimentRunner();
  runner.runComparison(seed, limit)
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = ExperimentRunner;