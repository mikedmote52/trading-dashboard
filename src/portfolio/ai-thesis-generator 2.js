/**
 * AI-Powered Thesis Generator for Portfolio Positions
 * Generates actionable intelligence for each position with learning capabilities
 */

const fetch = require('node-fetch');

// OpenRouter API for Claude/GPT analysis
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

/**
 * Generate an AI-powered actionable thesis for a position
 * @param {Object} position - Position data with health metrics
 * @param {Object} historicalData - Past performance and patterns
 * @returns {Object} Thesis with action, reasoning, confidence, targets
 */
async function generateAIThesis(position, historicalData = null) {
    try {
        // Prepare comprehensive context for AI analysis
        const context = buildAnalysisContext(position, historicalData);
        
        // Generate thesis using AI (Claude or GPT-4)
        const thesis = await callAIModel(context);
        
        // Store thesis for learning module
        await storeThesisForLearning(position.symbol, thesis);
        
        return thesis;
    } catch (error) {
        console.error(`❌ Error generating AI thesis for ${position.symbol}:`, error);
        return generateFallbackThesis(position);
    }
}

/**
 * Build comprehensive context for AI analysis
 */
function buildAnalysisContext(position, historicalData) {
    const { symbol, score, signals, catalyst, risk, unrealizedPLPercent } = position;
    
    return {
        prompt: `Analyze this trading position and provide actionable intelligence:

POSITION: ${symbol}
CURRENT P&L: ${unrealizedPLPercent.toFixed(1)}%
HEALTH SCORE: ${score}/100

TECHNICAL SIGNALS:
- VWAP Position: ${signals.aboveVWAP ? 'ABOVE ✅' : 'BELOW ❌'}
- Volume: ${signals.relVol}x average
- RSI: ${signals.rsi}
- EMA Cross: ${signals.emaCross}
- ATR%: ${signals.atrPct}

CATALYST:
- Event: ${catalyst.summary}
- Strength: ${catalyst.score}/10
- Age: ${catalyst.ageHours} hours

RISK METRICS:
- Suggested Stop: $${risk.suggestedStop}
- Target 1: $${risk.tp1}
- Target 2: $${risk.tp2}
- Risk/Reward: ${risk.riskRewardRatio}:1

${historicalData ? `
HISTORICAL PATTERNS:
- Previous similar setups: ${historicalData.similarSetups}
- Success rate: ${historicalData.successRate}%
- Average return: ${historicalData.avgReturn}%
` : ''}

Based on this data, provide:
1. PRIMARY ACTION: (BUY_MORE, HOLD, TRIM_PARTIAL, EXIT_FULL)
2. CONFIDENCE: (1-100%)
3. KEY REASONING: (2-3 sentences max)
4. SPECIFIC TRIGGERS: What to watch for
5. TIME HORIZON: When to reassess

Format as JSON with: {action, confidence, reasoning, triggers, timeframe}`,
        
        maxTokens: 300,
        temperature: 0.3, // Lower temperature for more consistent analysis
        model: 'claude-3-sonnet' // or 'gpt-4-turbo'
    };
}

/**
 * Call AI model for analysis
 */
async function callAIModel(context) {
    // TEMPORARILY DISABLED: OpenRouter is having API format issues
    // Option 1: Use OpenRouter (supports multiple models)
    // if (OPENROUTER_KEY) {
    //     return await callOpenRouter(context);
    // }
    
    // Option 2: Use Claude API directly
    if (CLAUDE_API_KEY) {
        return await callClaudeAPI(context);
    }
    
    // Option 3: Use local pattern matching (fallback) - USING THIS FOR NOW
    console.log('📝 Using pattern-based thesis generation (OpenRouter temporarily disabled)');
    return generatePatternBasedThesis(context);
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(context) {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'trading-dashboard',
                'X-Title': 'Trading Intelligence'
            },
            body: JSON.stringify({
                model: 'anthropic/claude-3-sonnet',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert trading analyst. Provide actionable, specific recommendations based on technical and fundamental data. Be decisive and clear.'
                    },
                    {
                        role: 'user',
                        content: context.prompt
                    }
                ],
                max_tokens: context.maxTokens,
                temperature: context.temperature
            })
        });
        
        const data = await response.json();
        
        // Debug log the actual response
        console.log('OpenRouter API response:', JSON.stringify(data, null, 2));
        
        // Handle different response formats more gracefully
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            console.warn('OpenRouter API returned unexpected format, falling back to pattern-based thesis');
            throw new Error('Invalid API response format - no choices array');
        }
        
        const choice = data.choices[0];
        if (!choice || !choice.message || !choice.message.content) {
            console.warn('OpenRouter API choice missing message content, falling back to pattern-based thesis');
            throw new Error('Invalid API response format - no message content');
        }
        
        const content = choice.message.content;
        
        // Parse JSON response with error handling
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (parseError) {
            console.warn('Failed to parse OpenRouter response as JSON, falling back to pattern-based thesis:', parseError.message);
            throw new Error('Failed to parse API response as JSON');
        }
        
        return {
            action: parsed.action || 'HOLD',
            confidence: parsed.confidence || 50,
            reasoning: parsed.reasoning || 'Analysis pending',
            triggers: parsed.triggers || [],
            timeframe: parsed.timeframe || '24 hours',
            source: 'ai-claude'
        };
        
    } catch (error) {
        console.error('OpenRouter API error:', error);
        throw error;
    }
}

/**
 * Call Claude API directly
 */
async function callClaudeAPI(context) {
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: context.maxTokens,
                temperature: context.temperature,
                messages: [
                    {
                        role: 'user',
                        content: context.prompt
                    }
                ]
            })
        });
        
        const data = await response.json();
        const content = data.content[0].text;
        
        // Parse JSON response
        const parsed = JSON.parse(content);
        
        return {
            action: parsed.action || 'HOLD',
            confidence: parsed.confidence || 50,
            reasoning: parsed.reasoning || 'Analysis pending',
            triggers: parsed.triggers || [],
            timeframe: parsed.timeframe || '24 hours',
            source: 'ai-claude-direct'
        };
        
    } catch (error) {
        console.error('Claude API error:', error);
        throw error;
    }
}

/**
 * Generate pattern-based thesis without AI (fallback)
 */
function generatePatternBasedThesis(context) {
    const position = context.position || {};
    const score = position.score || 50;
    const signals = position.signals || {};
    const pnl = position.unrealizedPLPercent || 0;
    const catalyst = position.catalyst || {};
    
    let action = 'HOLD';
    let confidence = 50;
    let reasoning = '';
    let triggers = [];
    
    // Enhanced decision tree with specific actions
    
    // SCENARIO 1: Strong momentum, add to winner
    if (score >= 80 && signals.aboveVWAP && signals.relVol >= 2.0 && pnl > 0) {
        action = 'BUY_MORE';
        confidence = 75;
        reasoning = `Score ${score} with ${signals.relVol.toFixed(1)}x volume surge. Strong setup above VWAP at RSI ${signals.rsi}. Add 25-50% to position.`;
        triggers = ['VWAP loss = exit adds', 'Vol < 1.5x = no more adds', 'Score < 70 = trim'];
        
    // SCENARIO 2: Perfect setup emerging
    } else if (score >= 85 && signals.vwapReclaim && catalyst.score >= 7) {
        action = 'BUY_MORE';
        confidence = 80;
        reasoning = `VWAP reclaim with fresh catalyst (${catalyst.ageHours}h old). Score ${score} signals breakout potential. Size up carefully.`;
        triggers = ['Break above resistance = add more', 'Hold above VWAP', 'Watch ${signals.rsi} RSI'];
        
    // SCENARIO 3: Solid hold with momentum
    } else if (score >= 70 && signals.aboveVWAP && pnl >= -5 && pnl <= 20) {
        action = 'HOLD';
        confidence = 65;
        reasoning = `Score ${score} holding above VWAP. P&L ${pnl.toFixed(1)}% on track. Let winner run with ${signals.relVol.toFixed(1)}x volume.`;
        triggers = ['Trail stop at VWAP', 'Take profits > 25%', 'Add if vol > 3x'];
        
    // SCENARIO 4: Technical breakdown - EXIT
    } else if (score < 60 && !signals.aboveVWAP && pnl < -8) {
        action = 'EXIT_FULL';
        confidence = 70;
        reasoning = `Score dropped to ${score}, lost VWAP, down ${Math.abs(pnl).toFixed(1)}%. Technical failure confirmed. Cut losses now.`;
        triggers = ['Exit immediately', 'No averaging down', 'Reassess in 48h'];
        
    // SCENARIO 5: Stale catalyst, trim winners
    } else if (catalyst.ageHours > 120 && pnl > 15) {
        action = 'TRIM_PARTIAL';
        confidence = 65;
        reasoning = `Catalyst ${catalyst.ageHours}h old, up ${pnl.toFixed(1)}%. News priced in. Take 50% profits, trail rest.`;
        triggers = ['Sell half position', 'Trail stop at entry', 'Full exit if < VWAP'];
        
    // SCENARIO 6: Overbought, lock gains
    } else if (signals.rsi > 75 && pnl > 20) {
        action = 'TRIM_PARTIAL';
        confidence = 70;
        reasoning = `RSI ${signals.rsi} overbought, up ${pnl.toFixed(1)}%. Momentum exhausted. Book 30-50% profits here.`;
        triggers = ['Trim on strength', 'Tighten stops', 'Re-enter on pullback'];
        
    // SCENARIO 7: Weak but not broken
    } else if (score >= 60 && score < 70 && Math.abs(pnl) < 10) {
        action = 'HOLD';
        confidence = 55;
        reasoning = `Score ${score} weakening but support holds. P&L ${pnl.toFixed(1)}% manageable. Give it 24-48h for clarity.`;
        triggers = ['Stop at -10%', 'Add if reclaims VWAP', 'Exit if score < 60'];
        
    // SCENARIO 8: Below VWAP but catalyst fresh
    } else if (!signals.aboveVWAP && catalyst.ageHours < 48 && catalyst.score >= 6) {
        action = 'HOLD';
        confidence = 60;
        reasoning = `Under VWAP but catalyst only ${catalyst.ageHours}h old. Score ${score}. Watch for reclaim in next session.`;
        triggers = ['Buy VWAP reclaim', 'Stop below support', 'Exit if no bounce in 24h'];
        
    // SCENARIO 9: Big winner getting extended
    } else if (pnl > 30 && signals.rsi > 70) {
        action = 'TRIM_PARTIAL';
        confidence = 75;
        reasoning = `Up ${pnl.toFixed(1)}% at RSI ${signals.rsi}. Parabolic move. Lock in 50-75% and let rest ride with trailing stop.`;
        triggers = ['Sell majority', 'Trail at 20% profit', 'Re-buy dips'];
        
    // DEFAULT: Monitor closely
    } else {
        action = 'MONITOR';
        confidence = 50;
        reasoning = `Score ${score}, P&L ${pnl.toFixed(1)}%. Mixed signals. Wait for clearer setup before acting.`;
        triggers = ['Watch VWAP test', `Monitor RSI ${signals.rsi}`, 'Check volume trends'];
    }
    
    return {
        action,
        confidence,
        reasoning,
        triggers,
        timeframe: '24-48 hours',
        source: 'pattern-based'
    };
}

/**
 * Generate fallback thesis when AI is unavailable
 */
function generateFallbackThesis(position) {
    const score = position.score || 50;
    const pnl = position.unrealizedPLPercent || 0;
    
    if (score >= 75) {
        return {
            action: 'HOLD',
            confidence: 60,
            reasoning: `Strong position with ${score} score. Momentum intact.`,
            triggers: ['Monitor VWAP', 'Watch volume'],
            timeframe: '24 hours',
            source: 'fallback'
        };
    } else if (score < 60) {
        return {
            action: 'CONSIDER_EXIT',
            confidence: 55,
            reasoning: `Weak position with ${score} score. Review risk/reward.`,
            triggers: ['Exit on bounce', 'Set tight stop'],
            timeframe: 'Immediate',
            source: 'fallback'
        };
    }
    
    return {
        action: 'MONITOR',
        confidence: 50,
        reasoning: 'Position requires closer analysis.',
        triggers: ['Review technicals'],
        timeframe: '24 hours',
        source: 'fallback'
    };
}

/**
 * Store thesis for learning module
 */
async function storeThesisForLearning(symbol, thesis) {
    try {
        // Store in database for pattern learning
        const db = require('../../server/db/sqlite');
        
        db.db.prepare(`
            INSERT INTO thesis_history (
                symbol, 
                thesis_date,
                action,
                confidence,
                reasoning,
                triggers,
                timeframe,
                source,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            symbol,
            new Date().toISOString(),
            thesis.action,
            thesis.confidence,
            thesis.reasoning,
            JSON.stringify(thesis.triggers),
            thesis.timeframe,
            thesis.source,
            new Date().toISOString()
        );
        
        console.log(`📝 Stored thesis for ${symbol} in learning module`);
        
    } catch (error) {
        console.error('Error storing thesis:', error);
    }
}

/**
 * Get historical thesis performance for learning
 */
async function getThesisPerformance(symbol, lookbackDays = 30) {
    try {
        const db = require('../../server/db/sqlite');
        
        const history = db.db.prepare(`
            SELECT 
                th.*,
                pp.realized_pnl,
                pp.exit_date,
                pp.exit_price
            FROM thesis_history th
            LEFT JOIN portfolio_positions pp 
                ON th.symbol = pp.symbol 
                AND pp.exit_date > th.thesis_date
            WHERE th.symbol = ?
            AND th.thesis_date > datetime('now', '-' || ? || ' days')
            ORDER BY th.thesis_date DESC
        `).all(symbol, lookbackDays);
        
        // Calculate accuracy metrics
        let correctCalls = 0;
        let totalCalls = history.length;
        
        history.forEach(thesis => {
            if (thesis.action === 'BUY_MORE' && thesis.realized_pnl > 0) correctCalls++;
            if (thesis.action === 'EXIT_FULL' && thesis.realized_pnl < 0) correctCalls++;
            if (thesis.action === 'HOLD' && Math.abs(thesis.realized_pnl) < 5) correctCalls++;
        });
        
        return {
            totalTheses: totalCalls,
            accuracy: totalCalls > 0 ? (correctCalls / totalCalls) * 100 : 0,
            history: history.slice(0, 10) // Last 10 theses
        };
        
    } catch (error) {
        console.error('Error getting thesis performance:', error);
        return null;
    }
}

module.exports = {
    generateAIThesis,
    generatePatternBasedThesis,
    storeThesisForLearning,
    getThesisPerformance
};