// Modern Discovery Card with React-like functionality but vanilla JS
// Maintains compatibility with existing system while adding production-quality UI

class DiscoveryCard {
    constructor(item) {
        this.item = item;
        this.modalOpen = false;
    }

    // Badge tier styling based on score
    getBadgeTier(score) {
        if (score >= 95) return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-emerald-500/20 shadow-lg";
        if (score >= 90) return "bg-sky-500/20 text-sky-300 border border-sky-500/30";
        return "bg-slate-500/20 text-slate-300 border border-slate-500/30";
    }

    // Generate thesis text
    getThesisText() {
        const item = this.item;
        const ticker = item.ticker || item.symbol || '';
        
        if (item.thesis_text) return item.thesis_text;
        if (item.thesis_tldr) return item.thesis_tldr;
        if (item.thesis) return item.thesis;
        
        let text = `${ticker} at $${item.price.toFixed(2)}`;
        const atr_pct = item.indicators?.atr_pct;
        const rel = item.rel_vol_30m ?? item.rel_vol_day ?? item.indicators?.relvol ?? null;
        
        if (atr_pct) text += `, ATR ${atr_pct.toFixed(1)}%`;
        if (rel && rel > 1.5) text += `, ${rel.toFixed(1)}× volume`;
        return text;
    }

    // Create the card HTML
    render() {
        const item = this.item;
        const ticker = item.ticker || item.symbol || '';
        const rel = item.rel_vol_30m ?? item.rel_vol_day ?? item.indicators?.relvol ?? null;
        const atr_pct = item.indicators?.atr_pct;
        const cardId = `card-${ticker}-${Math.random().toString(36).substr(2, 9)}`;

        return `
            <div class="rounded-2xl bg-slate-900/70 ring-1 ring-white/10 shadow-xl p-4 flex flex-col gap-3 hover:ring-emerald-500/30 hover:shadow-emerald-500/10 hover:shadow-lg transition-all duration-200" 
                 data-card-id="${cardId}" data-ticker="${ticker}">
                
                <!-- Header -->
                <div class="flex items-start justify-between">
                    <div>
                        <div class="text-xl font-semibold text-white">${ticker}</div>
                        <div class="text-slate-300">$${item.price.toFixed(2)}</div>
                    </div>
                    <div class="px-2 py-1 rounded-full text-xs font-bold ${this.getBadgeTier(item.score)}">
                        VIGL ${Math.round(item.score)}
                    </div>
                </div>

                <!-- Stats -->
                <div class="grid grid-cols-3 gap-3 text-sm">
                    ${rel !== null && rel !== undefined ? `
                    <div>
                        <div class="text-slate-400">RelVol</div>
                        <div class="text-slate-200">${rel.toFixed(1)}×</div>
                    </div>` : ''}
                    
                    ${typeof atr_pct === "number" ? `
                    <div>
                        <div class="text-slate-400">ATR%</div>
                        <div class="text-slate-200">${atr_pct.toFixed(1)}%</div>
                    </div>` : ''}
                    
                    ${item.dynamic_target_price ? `
                    <div>
                        <div class="text-slate-400">Target</div>
                        <div class="text-slate-200">
                            $${item.dynamic_target_price.toFixed(2)}
                            ${item.target_kind ? `<span class="text-xs text-slate-400"> (${item.target_kind})</span>` : ""}
                        </div>
                    </div>` : ''}
                </div>

                <!-- Thesis -->
                <div class="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                    ${this.getThesisText()}
                </div>

                <!-- Action -->
                ${item.action === "BUY" ? `
                <button onclick="DiscoveryCard.openOrderModal('${cardId}', '${ticker}')"
                    class="mt-1 w-full rounded-xl bg-emerald-600 text-white font-semibold py-3 hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all duration-200 transform hover:scale-[1.02]"
                    aria-haspopup="dialog">
                    Buy
                </button>` : ''}
            </div>
        `;
    }

    // Static method to open order modal
    static openOrderModal(cardId, ticker) {
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (!cardElement) return;
        
        // Find the original item data from the current opportunities
        const item = window.currentOpportunities?.find(opp => 
            (opp.ticker || opp.symbol) === ticker
        );
        
        if (!item) {
            DiscoveryCard.showToast('Stock data not found', 'error');
            return;
        }

        DiscoveryCard.showOrderModal(item);
    }

    // Show order modal
    static showOrderModal(item) {
        const ticker = item.ticker || item.symbol || '';
        const modalId = `modal-${ticker}-${Date.now()}`;
        
        const modalHTML = `
            <div role="dialog" aria-modal="true" id="${modalId}"
                class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="DiscoveryCard.closeModal('${modalId}')"></div>
                <div class="relative w-full max-w-md rounded-2xl bg-slate-900 ring-1 ring-white/10 shadow-2xl p-6 space-y-4">
                    <div class="flex items-start justify-between">
                        <div>
                            <div class="text-white text-lg font-semibold">Buy ${ticker}</div>
                            <div class="text-slate-400 text-sm">Default $100 · TP1 20% · TP2 50% · SL 10%</div>
                        </div>
                        <button onclick="DiscoveryCard.closeModal('${modalId}')" 
                            class="text-slate-400 hover:text-white transition-colors text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800"
                            aria-label="Close">
                            ✕
                        </button>
                    </div>

                    <!-- Amount -->
                    <div class="space-y-2">
                        <label class="block text-slate-300 text-sm font-medium">Amount (USD)</label>
                        <div class="flex items-center gap-2">
                            <button onclick="DiscoveryCard.adjustAmount('${modalId}', -25)"
                                class="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors">−25</button>
                            <input type="number" value="100" min="10" max="500"
                                class="flex-1 text-center px-3 py-2 rounded-lg bg-slate-800 text-white outline-none ring-1 ring-white/10 focus:ring-emerald-500/50 transition-all" 
                                id="${modalId}-amount" onchange="DiscoveryCard.validateAmount('${modalId}')"/>
                            <button onclick="DiscoveryCard.adjustAmount('${modalId}', 25)"
                                class="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors">+25</button>
                        </div>
                        <div class="text-slate-400 text-xs">Range $10–$500</div>
                    </div>

                    <!-- Auto TP/SL -->
                    <label class="flex items-center gap-2 text-slate-200 cursor-pointer">
                        <input type="checkbox" checked id="${modalId}-auto" onchange="DiscoveryCard.toggleAutoTPSL('${modalId}')"
                            class="rounded border-slate-600 bg-slate-800 text-emerald-600 focus:ring-emerald-500/50" />
                        Auto TP/SL (TP1 20%, TP2 50%, SL 10%)
                    </label>

                    <!-- Manual TP/SL (hidden by default) -->
                    <div id="${modalId}-manual" class="grid grid-cols-3 gap-2" style="display: none;">
                        <label class="text-slate-300 text-xs">
                            TP1 %
                            <input type="number" value="20" min="1" id="${modalId}-tp1"
                                class="mt-1 w-full rounded-lg bg-slate-800 px-2 py-1 text-center text-white ring-1 ring-white/10 focus:ring-emerald-500/50 transition-all" />
                        </label>
                        <label class="text-slate-300 text-xs">
                            TP2 %
                            <input type="number" value="50" min="1" id="${modalId}-tp2"
                                class="mt-1 w-full rounded-lg bg-slate-800 px-2 py-1 text-center text-white ring-1 ring-white/10 focus:ring-emerald-500/50 transition-all" />
                        </label>
                        <label class="text-slate-300 text-xs">
                            SL %
                            <input type="number" value="10" min="1" id="${modalId}-sl"
                                class="mt-1 w-full rounded-lg bg-slate-800 px-2 py-1 text-center text-white ring-1 ring-white/10 focus:ring-emerald-500/50 transition-all" />
                        </label>
                    </div>

                    <button id="${modalId}-submit" onclick="DiscoveryCard.submitOrder('${modalId}', '${ticker}')"
                        class="w-full rounded-xl py-3 font-semibold transition-all duration-200 bg-emerald-600 hover:bg-emerald-500 text-white transform hover:scale-[1.02]">
                        Confirm Buy
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Store item data on modal
        document.getElementById(modalId).itemData = item;
        
        // Focus management and escape key
        const modal = document.getElementById(modalId);
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') DiscoveryCard.closeModal(modalId);
        });
        modal.focus();
    }

    // Modal interaction methods
    static closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    }

    static adjustAmount(modalId, delta) {
        const input = document.getElementById(`${modalId}-amount`);
        const current = parseInt(input.value) || 100;
        const newValue = Math.max(10, Math.min(500, current + delta));
        input.value = newValue;
        DiscoveryCard.validateAmount(modalId);
    }

    static validateAmount(modalId) {
        const input = document.getElementById(`${modalId}-amount`);
        const button = document.getElementById(`${modalId}-submit`);
        const value = parseInt(input.value) || 0;
        const isValid = value >= 10 && value <= 500;
        
        button.disabled = !isValid;
        button.textContent = isValid ? 'Confirm Buy' : 'Must be $10-$500';
        button.className = isValid ? 
            "w-full rounded-xl py-3 font-semibold transition-all duration-200 bg-emerald-600 hover:bg-emerald-500 text-white transform hover:scale-[1.02]" :
            "w-full rounded-xl py-3 font-semibold transition-all duration-200 bg-slate-700 text-slate-400 cursor-not-allowed";
    }

    static toggleAutoTPSL(modalId) {
        const checkbox = document.getElementById(`${modalId}-auto`);
        const manual = document.getElementById(`${modalId}-manual`);
        manual.style.display = checkbox.checked ? 'none' : 'grid';
    }

    static async submitOrder(modalId, ticker) {
        const modal = document.getElementById(modalId);
        const item = modal.itemData;
        const button = document.getElementById(`${modalId}-submit`);
        
        if (button.disabled) return;
        
        // Get form values
        const usd = parseInt(document.getElementById(`${modalId}-amount`).value);
        const auto = document.getElementById(`${modalId}-auto`).checked;
        
        let tp1_pct = 0.20, tp2_pct = 0.50, sl_pct = 0.10;
        if (!auto) {
            tp1_pct = parseFloat(document.getElementById(`${modalId}-tp1`).value) / 100 || 0.20;
            tp2_pct = parseFloat(document.getElementById(`${modalId}-tp2`).value) / 100 || 0.50;
            sl_pct = parseFloat(document.getElementById(`${modalId}-sl`).value) / 100 || 0.10;
        }

        // Show loading state
        button.disabled = true;
        button.textContent = 'Placing Order...';

        try {
            const orderData = {
                ticker: ticker,
                usd: usd,
                tp1_pct: tp1_pct,
                tp2_pct: tp2_pct,
                sl_pct: sl_pct,
                engine: "python_v2",
                run_id: item.run_id,
                snapshot_ts: item.snapshot_ts || item.run_id?.split('-')[0],
                price: item.price
            };

            console.log('📦 Submitting order:', orderData);

            const response = await fetch('/api/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const result = await response.json();
            console.log('📊 Order result:', result);

            if (result.ok) {
                DiscoveryCard.showToast(`Order placed: ${ticker} (${result.position_id || result.order_id})`, 'success');
                DiscoveryCard.closeModal(modalId);
                
                // Optional: navigate to portfolio after success
                if (result.portfolio_link) {
                    setTimeout(() => {
                        // Show link or navigate
                        DiscoveryCard.showToast('View in Portfolio →', 'info');
                    }, 1500);
                }
            } else {
                throw new Error(result.error || 'Order failed');
            }

        } catch (error) {
            console.error('❌ Order error:', error);
            DiscoveryCard.showToast(`Order failed: ${error.message}`, 'error');
            
            // Reset button
            button.disabled = false;
            button.textContent = 'Confirm Buy';
        }
    }

    // Toast notification utility
    static showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `fixed z-50 top-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white transition-all duration-300 transform`;
        toast.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });
        
        // Remove after delay
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

// Enhanced rendering function that uses the new DiscoveryCard class
function renderDiscoveryCardsModern(opportunities) {
    const container = document.getElementById('discovery-cards');
    
    // Store opportunities globally for modal access
    window.currentOpportunities = opportunities;
    
    // Filter for only actionable recommendations and preserve API order
    const actionable = opportunities.filter(opp => 
        opp.action === 'BUY' || 
        opp.action === 'EARLY_READY' || 
        opp.action === 'WATCHLIST' ||
        opp.action === 'PRE_BREAKOUT'  // Legacy compatibility
    );
    
    if (actionable.length === 0) {
        container.innerHTML = '<div class="empty-state">No actionable recommendations found</div>';
        return;
    }
    
    // Group by action level while preserving order within groups
    const buyNow = actionable.filter(o => o.action === 'BUY');
    const earlyReady = actionable.filter(o => o.action === 'EARLY_READY');
    const watchlist = actionable.filter(o => o.action === 'WATCHLIST' || o.action === 'PRE_BREAKOUT');
    
    let html = '';
    
    // Show BUY recommendations first (show ALL, not capped at 6)
    if (buyNow.length > 0) {
        html += `<div class="discovery-section">
            <h3 class="section-header buy-header">🎯 BUY NOW (${buyNow.length})</h3>
            <div class="cards-grid">`;
        html += buyNow.map(opp => new DiscoveryCard(opp).render()).join('');
        html += '</div></div>';
    }
    
    // Show EARLY_READY recommendations (show ALL)
    if (earlyReady.length > 0) {
        html += `<div class="discovery-section">
            <h3 class="section-header early-header">👀 EARLY READY (${earlyReady.length})</h3>
            <div class="cards-grid">`;
        html += earlyReady.map(opp => new DiscoveryCard(opp).render()).join('');
        html += '</div></div>';
    }
    
    // Show WATCHLIST setups (show ALL)
    if (watchlist.length > 0) {
        html += `<div class="discovery-section">
            <h3 class="section-header watchlist-header">📈 WATCHLIST (${watchlist.length})</h3>
            <div class="cards-grid">`;
        html += watchlist.map(opp => new DiscoveryCard(opp).render()).join('');
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

// Client-side contenders picker (fallback)
function pickTop5Client(items, seed = 1337) {
    function relvol(x) {
        return x.rel_vol_30m || x.rel_vol_day || x.indicators?.relvol || 0;
    }
    
    function boost(x) {
        const rv = relvol(x);
        const atr = x.indicators?.atr_pct || 0;
        const ret5d = x.indicators?.ret_5d || 0;
        
        let boost = 0;
        boost += (rv >= 2.5 ? 6 : rv >= 1.8 ? 3 : 0);  // High relative volume
        boost += (atr >= 8 ? 4 : atr >= 5 ? 2 : 0);      // High volatility (percentage)
        boost += (ret5d >= 50 ? 4 : ret5d >= 25 ? 2 : 0); // Strong momentum
        boost += (x.score >= 95 ? 3 : 0);                 // Top scores
        
        return boost;
    }
    
    function tiebreak(seed, ticker) {
        // Simple hash for deterministic tie-breaking
        let hash = 0;
        const str = `${seed}:${ticker}`;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff;
        }
        return Math.abs(hash);
    }
    
    const scored = items.map(x => ({
        ...x,
        contender_score: 0.8 * (x.score || 0) + boost(x),
        _tiebreak: tiebreak(seed, x.ticker || x.symbol)
    }));
    
    return scored.sort((a, b) => {
        if (a.contender_score !== b.contender_score) return b.contender_score - a.contender_score;
        if (relvol(a) !== relvol(b)) return relvol(b) - relvol(a);
        if (a.price !== b.price) return a.price - b.price;
        return a._tiebreak - b._tiebreak;
    }).slice(0, 5);
}

// Render contenders only (cream of the crop)
function renderContendersOnly(picks) {
    const container = document.getElementById('discovery-cards');
    
    // Store picks globally for modal access
    window.currentOpportunities = picks;
    
    if (!picks || picks.length === 0) {
        container.innerHTML = '<div class="empty-state">No top contenders found</div>';
        return;
    }
    
    let html = `
        <div class="discovery-section">
            <h3 class="section-header buy-header">🏆 Top Contenders (${picks.length})</h3>
            <div class="cards-grid">
                ${picks.map(opp => new DiscoveryCard(opp).render()).join('')}
            </div>
            <div class="mt-4 text-center">
                <button class="btn-secondary" onclick="showAllDiscoveries()" 
                        style="background: rgba(148, 163, 184, 0.1); border: 1px solid rgba(148, 163, 184, 0.2); color: #94a3b8; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                    Show All (50) →
                </button>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// Show all discoveries (fallback to original view)
function showAllDiscoveries() {
    // Re-fetch without contenders and render full groups
    const seed = new URLSearchParams(window.location.search).get('seed') || 1337;
    const url = `/api/alphastack-v2/latest?limit=50&seed=${seed}`;
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.items && data.items.length > 0) {
                renderDiscoveryCardsModern(data.items);
                
                // Add "Back to Contenders" button
                const container = document.getElementById('discovery-cards');
                const backButton = document.createElement('div');
                backButton.className = 'mt-4 text-center';
                backButton.innerHTML = `
                    <button onclick="loadContenders()" 
                            style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                        ← Back to Top Contenders
                    </button>
                `;
                container.appendChild(backButton);
            }
        })
        .catch(error => {
            console.error('Failed to load all discoveries:', error);
        });
}

// Load contenders (new default view)
function loadContenders() {
    const seed = new URLSearchParams(window.location.search).get('seed') || 1337;
    const url = `/api/alphastack-v2/latest?limit=50&seed=${seed}&contenders=5`;
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                // Use contenders if available, otherwise pick top 5 client-side
                const picks = data.contenders && data.contenders.length 
                    ? data.contenders 
                    : pickTop5Client(data.items || [], seed);
                
                renderContendersOnly(picks);
            } else {
                console.error('Failed to load contenders:', data.error);
            }
        })
        .catch(error => {
            console.error('Failed to load contenders:', error);
        });
}

// Export for use in existing system
window.DiscoveryCard = DiscoveryCard;
window.renderDiscoveryCardsModern = renderDiscoveryCardsModern;
window.renderContendersOnly = renderContendersOnly;
window.pickTop5Client = pickTop5Client;
window.loadContenders = loadContenders;
window.showAllDiscoveries = showAllDiscoveries;