// minimal-buy-button-fix.js
// Add this ONE file to your existing trading-dashboard
// This fixes ONLY the buy button issue without touching existing code

(function() {
    'use strict';
    
    console.log('🔧 Loading minimal buy button fix...');
    
    // 1. Fix DOM errors by creating missing elements (non-disruptive)
    function createMissingElements() {
        // Only create if they don't exist
        if (!document.getElementById('scanningIndicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'scanningIndicator';
            indicator.style.cssText = `
                display: none;
                align-items: center;
                gap: 10px;
                padding: 15px;
                background: rgba(102, 126, 234, 0.2);
                border-radius: 10px;
                margin-bottom: 20px;
                color: white;
            `;
            indicator.innerHTML = '<div>Scanning...</div>';
            
            // Insert before grid if it exists
            const grid = document.querySelector('.discoveries-grid') || document.body;
            grid.parentNode.insertBefore(indicator, grid);
        }
        
        if (!document.getElementById('errorMessage')) {
            const errorDiv = document.createElement('div');
            errorDiv.id = 'errorMessage';
            errorDiv.style.cssText = `
                display: none;
                padding: 15px;
                background: rgba(239, 68, 68, 0.2);
                border-radius: 10px;
                color: #fca5a5;
                margin-bottom: 20px;
            `;
            document.body.appendChild(errorDiv);
        }
        
        if (!document.getElementById('successMessage')) {
            const successDiv = document.createElement('div');
            successDiv.id = 'successMessage';
            successDiv.style.cssText = `
                display: none;
                padding: 15px;
                background: rgba(74, 222, 128, 0.2);
                border-radius: 10px;
                color: #86efac;
                margin-bottom: 20px;
            `;
            document.body.appendChild(successDiv);
        }
    }
    
    // 2. Add buy buttons to existing discovery cards (surgical enhancement)
    function enhanceDiscoveryCards() {
        // Find all discovery cards that show BUY signal
        const discoveryCards = document.querySelectorAll('[data-signal="BUY"], .discovery-card');
        
        discoveryCards.forEach(card => {
            // Check if this card shows BUY signal
            const signalBadge = card.querySelector('.signal-badge');
            if (!signalBadge || !signalBadge.textContent.includes('BUY')) return;
            
            // Check if buy button already exists
            if (card.querySelector('.btn-buy')) return;
            
            // Get symbol from card
            const symbolElement = card.querySelector('.symbol');
            if (!symbolElement) return;
            
            const symbol = symbolElement.textContent.trim();
            
            // Get price from card data-price attribute (clean numeric source)
            const price = parseFloat(card.dataset.price) || 0;
            
            // Add buy button interface
            const actionsDiv = card.querySelector('.discovery-actions') || 
                               card.querySelector('[style*="margin-top"]') ||
                               card;
            
            if (actionsDiv) {
                const buyInterface = document.createElement('div');
                buyInterface.style.cssText = `
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    margin-top: 15px;
                    padding-top: 15px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                `;
                
                buyInterface.innerHTML = `
                    <input type="number" 
                           value="10" 
                           min="1" 
                           max="1000"
                           id="qty-${symbol}"
                           style="
                               width: 80px;
                               padding: 8px;
                               border: 1px solid rgba(255,255,255,0.3);
                               border-radius: 6px;
                               background: rgba(255,255,255,0.1);
                               color: white;
                               text-align: center;
                           ">
                    <button onclick="executeBuyOrder('${symbol}', ${price})"
                            style="
                                background: linear-gradient(45deg, #4ade80, #22c55e);
                                padding: 8px 16px;
                                border: none;
                                border-radius: 6px;
                                color: white;
                                font-weight: 600;
                                cursor: pointer;
                                min-width: 80px;
                            ">
                        Buy Now
                    </button>
                `;
                
                actionsDiv.appendChild(buyInterface);
            }
        });
    }
    
    // 3. Real Alpaca API integration (no mocks)
    window.executeBuyOrder = async function(symbol, price) {
        try {
            const qtyInput = document.getElementById(`qty-${symbol}`);
            const quantity = qtyInput ? parseInt(qtyInput.value) || 10 : 10;
            
            // Confirm with user
            const confirmed = confirm(
                `Execute BUY order for ${quantity} shares of ${symbol}?\n` +
                `Estimated cost: $${(quantity * price).toFixed(2)}`
            );
            
            if (!confirmed) return;
            
            // Show loading
            const btn = event.target;
            btn.textContent = 'Executing...';
            btn.disabled = true;
            
            // Call real Alpaca API
            const response = await fetch('/api/alpaca/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: symbol,
                    quantity: quantity,
                    order_type: 'market'
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showMessage(`✅ Order placed: ${quantity} shares of ${symbol}`, 'success');
                btn.textContent = '✅ Ordered';
                btn.style.background = '#4ade80';
            } else {
                throw new Error(result.error || 'Order failed');
            }
            
        } catch (error) {
            console.error('Buy order error:', error);
            showMessage(`❌ Order failed: ${error.message}`, 'error');
            event.target.textContent = 'Buy Now';
            event.target.disabled = false;
        }
    };
    
    // 4. Real data message system
    function showMessage(message, type) {
        const messageEl = document.getElementById(type === 'success' ? 'successMessage' : 'errorMessage');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.style.display = 'block';
            setTimeout(() => messageEl.style.display = 'none', 5000);
        } else {
            alert(message); // Fallback
        }
    }
    
    // 5. Initialize fixes when page loads
    function initialize() {
        createMissingElements();
        
        // Wait for discovery cards to load, then enhance them
        const checkForCards = setInterval(() => {
            const cards = document.querySelectorAll('.discovery-card, [class*="discovery"]');
            if (cards.length > 0) {
                enhanceDiscoveryCards();
                clearInterval(checkForCards);
                console.log('✅ Buy buttons added to BUY signals');
            }
        }, 1000);
        
        // Stop checking after 30 seconds
        setTimeout(() => clearInterval(checkForCards), 30000);
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    console.log('✅ Minimal buy button fix loaded - no existing code modified');
})();