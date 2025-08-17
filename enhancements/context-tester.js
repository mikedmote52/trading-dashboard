/**
 * Safe Testing Framework for Context Intelligence
 * Tests the enhancement without affecting the live system
 */

const ContextIntelligence = require('./context-intelligence');

class ContextTester {
    constructor() {
        this.contextEngine = new ContextIntelligence();
    }

    /**
     * Test context intelligence with sample data
     */
    async runTests() {
        console.log('🧪 Starting Context Intelligence Tests...');
        
        const samplePortfolio = this.createSamplePortfolio();
        const sampleDiscoveries = this.createSampleDiscoveries();
        
        // Test 1: Basic enhancement
        console.log('\n📊 Test 1: Basic Enhancement');
        try {
            const enhanced = this.contextEngine.enrichDiscoveries(sampleDiscoveries, samplePortfolio);
            console.log(`✅ Enhanced ${enhanced.length} discoveries`);
            console.log(`   First discovery context:`, enhanced[0].context?.market?.session);
        } catch (error) {
            console.log(`❌ Enhancement failed:`, error.message);
        }

        // Test 2: Market context
        console.log('\n🕐 Test 2: Market Context');
        try {
            const marketContext = this.contextEngine.getMarketContext();
            console.log(`✅ Market session: ${marketContext.session}`);
            console.log(`   Phase: ${marketContext.sessionPhase}`);
            console.log(`   Optimal timing: ${marketContext.optimalTiming}`);
        } catch (error) {
            console.log(`❌ Market context failed:`, error.message);
        }

        // Test 3: Portfolio context
        console.log('\n💼 Test 3: Portfolio Context');
        try {
            const portfolioContext = this.contextEngine.getPortfolioContext(samplePortfolio);
            console.log(`✅ Position count: ${portfolioContext.positionCount}`);
            console.log(`   Risk capacity: ${portfolioContext.riskCapacity}`);
            console.log(`   Diversification: ${Math.round(portfolioContext.diversification * 100)}%`);
        } catch (error) {
            console.log(`❌ Portfolio context failed:`, error.message);
        }

        // Test 4: Summary generation
        console.log('\n📋 Test 4: Summary Generation');
        try {
            const enhanced = this.contextEngine.enrichDiscoveries(sampleDiscoveries, samplePortfolio);
            const summary = this.contextEngine.generateContextSummary(enhanced, samplePortfolio);
            console.log(`✅ Generated summary:`, summary.opportunities?.recommendation);
        } catch (error) {
            console.log(`❌ Summary generation failed:`, error.message);
        }

        console.log('\n🎯 Context Intelligence Tests Complete');
        return true;
    }

    createSamplePortfolio() {
        return {
            positions: [
                {
                    symbol: 'AAPL',
                    marketValue: 5000,
                    unrealizedPnLPercent: 0.05,
                    riskAnalysis: { wolfScore: 0.3 }
                },
                {
                    symbol: 'TSLA',
                    marketValue: 3000,
                    unrealizedPnLPercent: -0.08,
                    riskAnalysis: { wolfScore: 0.6 }
                }
            ],
            totalValue: 25000,
            dailyPnL: 150
        };
    }

    createSampleDiscoveries() {
        return [
            {
                symbol: 'VIGL',
                score: 85,
                confidence: 0.87,
                volumeSpike: 12.5,
                riskLevel: 'MODERATE',
                discoveredAt: new Date().toISOString()
            },
            {
                symbol: 'CRWV',
                score: 72,
                confidence: 0.74,
                volumeSpike: 8.2,
                riskLevel: 'MODERATE',
                discoveredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
            }
        ];
    }

    /**
     * Performance test
     */
    async runPerformanceTest() {
        console.log('\n⚡ Performance Test');
        const startTime = Date.now();
        
        const portfolio = this.createSamplePortfolio();
        const discoveries = Array(50).fill().map((_, i) => ({
            symbol: `TEST${i}`,
            score: 60 + Math.random() * 40,
            confidence: 0.5 + Math.random() * 0.5,
            volumeSpike: 1 + Math.random() * 20,
            discoveredAt: new Date().toISOString()
        }));

        const enhanced = this.contextEngine.enrichDiscoveries(discoveries, portfolio);
        const duration = Date.now() - startTime;
        
        console.log(`✅ Enhanced ${enhanced.length} discoveries in ${duration}ms`);
        console.log(`   Average: ${(duration / enhanced.length).toFixed(2)}ms per discovery`);
        
        return duration < 1000; // Should complete in under 1 second
    }
}

// Export for testing
module.exports = ContextTester;

// Run tests if executed directly
if (require.main === module) {
    const tester = new ContextTester();
    tester.runTests()
        .then(() => tester.runPerformanceTest())
        .then(() => console.log('🎉 All tests completed'))
        .catch(error => console.error('❌ Test failed:', error));
}