/**
 * Safe Context Enhancement Integration
 * Provides optional intelligent context without modifying existing systems
 * SAFETY: Can be enabled/disabled via environment variable
 */

const ContextIntelligence = require('../enhancements/context-intelligence');

class SafeContextIntegration {
    constructor() {
        this.enabled = process.env.ENABLE_CONTEXT_INTELLIGENCE === 'true';
        this.contextEngine = this.enabled ? new ContextIntelligence() : null;
        
        if (this.enabled) {
            console.log('✅ Context Intelligence enabled');
        } else {
            console.log('ℹ️  Context Intelligence disabled (set ENABLE_CONTEXT_INTELLIGENCE=true to enable)');
        }
    }

    /**
     * Safely enhance discoveries with context if enabled
     * Falls back to original data if disabled or on error
     */
    enhanceDiscoveries(discoveries, portfolio) {
        if (!this.enabled || !this.contextEngine) {
            return discoveries; // Return unchanged if disabled
        }

        try {
            const enhanced = this.contextEngine.enrichDiscoveries(discoveries, portfolio);
            console.log(`🧠 Context enhanced ${enhanced.length} discoveries`);
            return enhanced;
        } catch (error) {
            console.warn('⚠️ Context enhancement failed, using original data:', error.message);
            return discoveries; // Safe fallback
        }
    }

    /**
     * Generate context summary if enabled
     */
    generateSummary(discoveries, portfolio) {
        if (!this.enabled || !this.contextEngine) {
            return null;
        }

        try {
            return this.contextEngine.generateContextSummary(discoveries, portfolio);
        } catch (error) {
            console.warn('⚠️ Context summary failed:', error.message);
            return null;
        }
    }

    /**
     * Check if context intelligence is available
     */
    isEnabled() {
        return this.enabled;
    }
}

// Export singleton instance
module.exports = new SafeContextIntegration();