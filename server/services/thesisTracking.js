/**
 * Thesis Tracking Service
 * Tracks entry reasons, scores, and performance for portfolio positions
 */

const fs = require('fs');
const path = require('path');

class ThesisTracker {
  constructor() {
    this.thesesFile = path.join(__dirname, '../../data/position_theses.json');
    this.theses = this.loadTheses();
  }

  loadTheses() {
    try {
      if (fs.existsSync(this.thesesFile)) {
        const data = fs.readFileSync(this.thesesFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading theses:', error);
    }
    return {};
  }

  saveTheses() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.thesesFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(this.thesesFile, JSON.stringify(this.theses, null, 2));
    } catch (error) {
      console.error('Error saving theses:', error);
    }
  }

  /**
   * Record entry thesis for a position
   */
  recordEntry(symbol, data) {
    const thesis = {
      symbol,
      entryDate: data.entryDate || new Date().toISOString(),
      entryPrice: data.entryPrice,
      entryScore: data.entryScore || 0,
      entryReason: data.entryReason || 'Manual entry',
      catalyst: data.catalyst || '',
      targetPrice: data.targetPrice,
      stopLoss: data.stopLoss,
      timeHorizon: data.timeHorizon || '1-3 months',
      confidence: data.confidence || 70,
      source: data.source || 'Manual',
      tags: data.tags || [],
      lastUpdated: new Date().toISOString()
    };

    this.theses[symbol] = thesis;
    this.saveTheses();
    return thesis;
  }

  /**
   * Get thesis for a position
   */
  getThesis(symbol) {
    return this.theses[symbol] || null;
  }

  /**
   * Update current score and analyze thesis performance
   */
  updateThesis(symbol, currentScore, currentPrice) {
    const thesis = this.theses[symbol];
    if (!thesis) return null;

    const entryScore = thesis.entryScore || 0;
    const scoreDelta = currentScore - entryScore;
    const priceReturn = currentPrice && thesis.entryPrice 
      ? ((currentPrice - thesis.entryPrice) / thesis.entryPrice) * 100 
      : 0;

    // Determine thesis strength
    let thesisStrength = 'NEUTRAL';
    if (scoreDelta >= 5) thesisStrength = 'STRENGTHENING';
    else if (scoreDelta <= -5) thesisStrength = 'WEAKENING';
    else if (Math.abs(scoreDelta) <= 2) thesisStrength = 'STABLE';

    // Color coding
    const strengthColor = {
      'STRENGTHENING': 'GREEN',
      'STABLE': 'BLUE', 
      'NEUTRAL': 'YELLOW',
      'WEAKENING': 'RED'
    };

    const updatedThesis = {
      ...thesis,
      currentScore,
      currentPrice,
      scoreDelta,
      priceReturn,
      thesisStrength,
      strengthColor: strengthColor[thesisStrength],
      daysSinceEntry: Math.floor((Date.now() - new Date(thesis.entryDate)) / (1000 * 60 * 60 * 24)),
      lastUpdated: new Date().toISOString()
    };

    this.theses[symbol] = updatedThesis;
    this.saveTheses();
    return updatedThesis;
  }

  /**
   * Analyze all positions and return thesis data
   */
  analyzePositions(positions, alphaStackScores = {}) {
    const analysisResults = [];

    for (const position of positions) {
      const symbol = position.symbol;
      let thesis = this.getThesis(symbol);
      
      // Auto-create thesis for existing positions if missing
      if (!thesis) {
        thesis = this.recordEntry(symbol, {
          entryDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Assume 30 days ago
          entryPrice: position.avgEntryPrice || position.currentPrice,
          entryScore: 65, // Default score
          entryReason: 'Existing position - auto-created',
          source: 'Legacy'
        });
      }

      // Get current AlphaStack score if available
      const currentScore = alphaStackScores[symbol] || thesis.entryScore || 65;
      
      // Update thesis with current data
      const updatedThesis = this.updateThesis(symbol, currentScore, position.currentPrice);

      analysisResults.push({
        position,
        thesis: updatedThesis,
        enhanced: true
      });
    }

    return analysisResults;
  }

  /**
   * Get thesis summary statistics
   */
  getThesesSummary() {
    const theses = Object.values(this.theses);
    const activeTheses = theses.filter(t => t.currentPrice);
    
    if (activeTheses.length === 0) {
      return {
        totalPositions: 0,
        avgScoreDelta: 0,
        strengthening: 0,
        weakening: 0,
        stable: 0
      };
    }

    const avgScoreDelta = activeTheses.reduce((sum, t) => sum + (t.scoreDelta || 0), 0) / activeTheses.length;
    
    return {
      totalPositions: activeTheses.length,
      avgScoreDelta: Math.round(avgScoreDelta * 10) / 10,
      strengthening: activeTheses.filter(t => t.thesisStrength === 'STRENGTHENING').length,
      weakening: activeTheses.filter(t => t.thesisStrength === 'WEAKENING').length,
      stable: activeTheses.filter(t => t.thesisStrength === 'STABLE').length
    };
  }
}

// Singleton instance
const thesisTracker = new ThesisTracker();

module.exports = {
  ThesisTracker,
  thesisTracker
};