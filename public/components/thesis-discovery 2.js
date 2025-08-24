/**
 * Thesis-First Discovery Component (Vanilla JS version)
 * - Pulls /api/scan/results and renders ranked cards
 * - Robust thesis view with: Thesis, Timeline, Technicals, Options, Risk, Plan
 * - $100 sizing & R:R, signal chips, session badge
 * - No external web sources; uses your scanner JSON only
 */

class ThesisDiscoveryUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.rows = [];
    this.loading = false;
    this.status = null;
    this.selectedRow = null;
    
    this.init();
  }
  
  init() {
    this.render();
    this.fetchResults();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="max-w-6xl mx-auto p-4 space-y-4">
        <header class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-white">Live AlphaStack Discoveries</h1>
            <p class="text-sm text-gray-400">
              Ranked by composite score • Session: <span id="session-badge">unknown</span>
            </p>
          </div>
          <button id="refresh-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2">
            <span>⚡</span> <span id="refresh-text">Refresh</span>
          </button>
        </header>

        <div id="discoveries-grid" class="grid md:grid-cols-2 gap-4">
          <div class="text-center py-8 text-gray-400">Loading discoveries...</div>
        </div>
      </div>
      
      <!-- Thesis Modal -->
      <div id="thesis-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-black/80" onclick="window.thesisUI.closeModal()"></div>
        <div class="relative bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-w-4xl w-full m-4 max-h-[90vh] overflow-auto">
          <div id="modal-content" class="p-6">
            <!-- Modal content will be inserted here -->
          </div>
        </div>
      </div>
    `;
    
    // Bind events
    document.getElementById('refresh-btn').onclick = () => this.fetchResults();
    
    // Make this accessible globally for modal handling
    window.thesisUI = this;
  }
  
  async fetchResults() {
    this.loading = true;
    this.updateRefreshButton();
    
    try {
      // 1) Kick a scan if cache is stale
      await fetch(`/api/scan/today?refresh=1&relvolmin=2&rsimin=58&rsimax=78&atrpctmin=3.5&requireemacross=false`);
      
      // 2) Poll status
      for (let i = 0; i < 40; i++) {
        const s = await (await fetch(`/api/scan/status`)).json();
        this.status = s;
        this.updateSessionBadge();
        if (!s.inProgress) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      
      // 3) Get results
      const data = await (await fetch(`/api/scan/results`)).json();
      this.rows = data.map(this.adaptRow);
      this.renderDiscoveries();
      
    } catch (e) {
      console.error('Error fetching results:', e);
      this.renderError(e.message);
    } finally {
      this.loading = false;
      this.updateRefreshButton();
    }
  }
  
  adaptRow(x) {
    const entry = x.entry_plan?.entry_price ?? x.price;
    const stop = x.entry_plan?.stop_loss ?? entry * 0.9;
    const tp1 = x.entry_plan?.tp1 ?? entry * 1.2;
    const rr = entry && stop && tp1 ? (tp1 - entry) / Math.max(0.01, entry - stop) : null;
    const shares = Math.max(0, Math.floor(100 / (x.price || 1)));

    return {
      symbol: x.ticker,
      name: x.name || x.ticker,
      price: x.price,
      score: x.alpha_score || x.score,
      rvol: x.rel_volume || x.relVolume || 1,
      thesis: x.catalyst || x.thesis || "Catalyst not provided",
      catalystEvents: x.catalyst_events || [],
      signals: {
        vwap: x.above_vwap || x.aboveVWAP,
        emaCross: x.ema_cross_9_20 === "confirmed" || x.emaCross920 === "confirmed",
        rsi: x.rsi_14 || x.rsi14 || 50,
        atrPct: x.atr_pct || x.atrPct || 2,
        callPut: x.options_call_put_ratio || 1.5,
        oiDelta: x.near_money_oi_change || 0,
      },
      squeeze: {
        sharesOut: x.shares_outstanding || 50000000,
      },
      plan: {
        entry,
        stop,
        tp1,
        tp2: x.entry_plan?.tp2 ?? entry * 1.5,
        rr,
        shares,
      },
      session: x.session || "unknown",
      asOf: x.as_of || new Date().toISOString(),
      action: x.action || (x.alpha_score >= 75 ? "TRADE_READY" : "WATCHLIST"),
    };
  }
  
  renderDiscoveries() {
    const grid = document.getElementById('discoveries-grid');
    
    if (!this.rows || this.rows.length === 0) {
      grid.innerHTML = `
        <div class="col-span-2 text-center py-8 text-gray-400">
          No candidates met criteria this cycle. Try relaxing filters or refresh.
        </div>
      `;
      return;
    }
    
    grid.innerHTML = this.rows.slice(0, 10).map(row => this.renderCandidateCard(row)).join('');
  }
  
  renderCandidateCard(row) {
    // Clean 3-row layout with smart filtering
    const borderColor = row.action === 'TRADE_READY' ? 'border-l-emerald-400' 
                      : row.action === 'OVER_CAP_WATCH' ? 'border-l-amber-400'
                      : 'border-l-slate-500';
    
    const scoreTone = row.score >= 85 ? 'text-emerald-400'
                    : row.score >= 75 ? 'text-emerald-300'
                    : 'text-slate-400';
    
    const actionChip = row.action === 'TRADE_READY' ? '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Trade-ready</span>'
                     : row.action === 'OVER_CAP_WATCH' ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Over-cap</span>'
                     : '<span class="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Watch</span>';
    
    const signals = this.pickTopSignals(row);
    const sizingCost = (row.plan.shares * row.price).toFixed(2);
    
    return `
      <div class="bg-slate-800 border border-slate-600 border-l-4 ${borderColor} rounded-2xl shadow-sm hover:shadow-md transition">
        <div class="p-4 flex flex-col gap-3">
          <!-- Row 1: Header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg font-semibold tracking-tight text-white">${row.symbol}</span>
              ${actionChip}
            </div>
            <div class="text-right">
              <div class="text-xl font-semibold text-white">$${row.price?.toFixed(2)}</div>
              <div class="text-xs ${scoreTone}">Score ${row.score}</div>
            </div>
          </div>

          <!-- Row 2: One-liner thesis (clamped) -->
          <div class="text-sm text-slate-300/90 line-clamp-1 leading-relaxed">
            ${this.composeCleanOneLiner(row)}
          </div>

          <!-- Row 3: Compact signals + actions -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 flex-wrap">
              ${signals.map(s => s.html).join('')}
            </div>
            <div class="flex items-center gap-3">
              <div class="text-xs text-slate-400">
                $${sizingCost} / ${row.plan.shares} sh
              </div>
              <button 
                onclick="window.thesisUI.openModal('${row.symbol}')" 
                class="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
              >
                <span>ℹ️</span> Thesis
              </button>
            </div>
          </div>

          <!-- Meta -->
          <div class="text-xs text-slate-500">
            ${row.session} • as of ${new Date(row.asOf).toLocaleTimeString()}
          </div>
        </div>
      </div>
    `;
  }
  
  pickTopSignals(row) {
    // Smart signal picking - max 4, only show meaningful ones
    const signals = [];
    
    // 1. rVol (always show if >1, color-code if ≥3)
    if (row.rvol) {
      const tone = row.rvol >= 3 ? 'emerald' : 'blue';
      signals.push({
        html: `<span class="px-2 py-0.5 rounded-full text-xs bg-${tone}-100 text-${tone}-700 inline-flex items-center gap-1">
                 📈 ${row.rvol.toFixed(1)}× rVol
               </span>`
      });
    }
    
    // 2. VWAP (always show with up/down indicator)
    const vwapTone = row.signals.vwap ? 'emerald' : 'rose';
    const vwapIcon = row.signals.vwap ? '↗️' : '↘️';
    const vwapText = row.signals.vwap ? 'Above VWAP' : 'Below VWAP';
    signals.push({
      html: `<span class="px-2 py-0.5 rounded-full text-xs bg-${vwapTone}-100 text-${vwapTone}-700 inline-flex items-center gap-1">
               ${vwapIcon} ${vwapText}
             </span>`
    });
    
    // 3. 9/20 Cross (always show)
    const emaTone = row.signals.emaCross ? 'emerald' : 'slate';
    const emaText = row.signals.emaCross ? '9/20 Cross' : 'Cross forming';
    signals.push({
      html: `<span class="px-2 py-0.5 rounded-full text-xs bg-${emaTone}-100 text-${emaTone}-700 inline-flex items-center gap-1">
               📊 ${emaText}
             </span>`
    });
    
    // 4. RSI (only if extreme >74, or if we have space)
    if (row.signals.rsi && (row.signals.rsi > 74 || signals.length < 4)) {
      const rsiTone = row.signals.rsi > 74 ? 'amber' : 'blue';
      signals.push({
        html: `<span class="px-2 py-0.5 rounded-full text-xs bg-${rsiTone}-100 text-${rsiTone}-700 inline-flex items-center gap-1">
                 ⚡ RSI ${Math.round(row.signals.rsi)}
               </span>`
      });
    }
    
    // 5. C/P (only if ≥2 and we have space)
    if (row.signals.callPut && row.signals.callPut >= 2 && signals.length < 4) {
      signals.push({
        html: `<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                 🔢 C/P ${row.signals.callPut.toFixed(1)}
               </span>`
      });
    }
    
    return signals.slice(0, 4); // Never more than 4
  }
  
  composeCleanOneLiner(row) {
    // Build clean, single-line thesis focusing on "why now"
    const bits = [];
    if (row.thesis && row.thesis.length < 60) bits.push(row.thesis);
    if (row.rvol && row.rvol >= 2) bits.push(`${row.rvol.toFixed(1)}× rel-vol`);
    if (row.signals?.vwap) bits.push("holding VWAP");
    if (row.signals?.emaCross) bits.push("9/20 cross");
    
    const result = bits.filter(Boolean).join(" • ");
    return result.length > 80 ? result.substring(0, 77) + "..." : result;
  }
  
  composeOneLiner(row) {
    const parts = [];
    if (row.thesis) parts.push(row.thesis);
    if (row.signals?.vwap) parts.push("holding VWAP");
    if (row.signals?.emaCross) parts.push("9/20 cross");
    if (row.rvol) parts.push(`${row.rvol.toFixed(1)}× rel-vol`);
    if (row.signals?.callPut && row.signals.callPut >= 2) parts.push(`C/P ${row.signals.callPut.toFixed(1)}`);
    return parts.filter(Boolean).join(" • ");
  }
  
  openModal(symbol) {
    const row = this.rows.find(r => r.symbol === symbol);
    if (!row) return;
    
    this.selectedRow = row;
    this.renderModal(row);
    document.getElementById('thesis-modal').classList.remove('hidden');
  }
  
  closeModal() {
    document.getElementById('thesis-modal').classList.add('hidden');
    this.selectedRow = null;
  }
  
  renderModal(row) {
    const rr1 = row.plan.rr ? row.plan.rr.toFixed(2) : "–";
    const thesisBlocks = this.composeThesisBlocks(row);
    
    document.getElementById('modal-content').innerHTML = `
      <div class="flex items-center gap-2 mb-6 pb-4 border-b border-slate-600">
        <span class="text-2xl font-semibold text-white">${row.symbol}</span>
        <span class="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">${row.session}</span>
        <span class="px-2 py-0.5 rounded-full text-xs ${row.action === 'TRADE_READY' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}">
          Score ${row.score}
        </span>
        <button onclick="window.thesisUI.closeModal()" class="ml-auto text-gray-400 hover:text-white">✕</button>
      </div>

      <div class="space-y-4">
        <!-- Thesis -->
        ${this.renderSection('Thesis', '📰', `
          <p class="text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">${thesisBlocks.thesis}</p>
        `)}

        <!-- Timeline -->
        ${this.renderSection('Timeline', '🕐', row.catalystEvents?.length ? `
          <ul class="text-sm list-disc pl-5 space-y-1 text-gray-300">
            ${row.catalystEvents.map(e => `
              <li><span class="font-medium text-white">${e.date || e.when}</span> — ${e.label || e.title} 
                ${e.confidence ? `(${Math.round(e.confidence*100)}% conf)` : ''}</li>
            `).join('')}
          </ul>
        ` : '<div class="text-sm text-gray-400">No upcoming events provided.</div>')}

        <!-- Technicals -->
        ${this.renderSection('Technicals', '📊', this.renderTechGrid(row))}

        <!-- Options & Squeeze -->
        ${this.renderSection('Options & Squeeze', '⚖️', `
          <div class="grid grid-cols-2 gap-3 text-sm">
            ${this.renderMetric('Call/Put', row.signals.callPut ? row.signals.callPut.toFixed(2) : '–')}
            ${this.renderMetric('Near-money OI Δ', this.fmtPct(row.signals.oiDelta))}
            ${this.renderMetric('Shares Outstanding', row.squeeze.sharesOut ? row.squeeze.sharesOut.toLocaleString() : '–')}
            ${this.renderMetric('Rel-Vol', row.rvol?.toFixed(2))}
          </div>
        `)}

        <!-- Trade Plan -->
        ${this.renderSection('Trade Plan', '🎯', `
          <div class="grid grid-cols-2 gap-3 text-sm">
            ${this.renderMetric('Entry', row.plan.entry ? `$${row.plan.entry.toFixed(2)}` : 'HOD/VWAP trigger')}
            ${this.renderMetric('Stop', row.plan.stop ? `$${row.plan.stop.toFixed(2)}` : '10% from entry')}
            ${this.renderMetric('TP1', row.plan.tp1 ? `$${row.plan.tp1.toFixed(2)}` : '+20%')}
            ${this.renderMetric('TP2', row.plan.tp2 ? `$${row.plan.tp2.toFixed(2)}` : '+50–100%')}
            ${this.renderMetric('R:R (TP1)', rr1)}
            ${this.renderMetric('$100 sizing', `${row.plan.shares} shares ($${(row.plan.shares*row.price).toFixed(2)})`)}
          </div>
        `)}

        <!-- Key Risks -->
        ${this.renderSection('Key Risks', '⚠️', `
          <ul class="text-sm list-disc pl-5 space-y-1 text-gray-300">
            ${thesisBlocks.risks.map(r => `<li>${r}</li>`).join('')}
          </ul>
        `)}
      </div>
    `;
  }
  
  renderSection(title, icon, content) {
    return `
      <div class="p-3 rounded-xl border border-slate-600 bg-slate-700/50">
        <div class="flex items-center gap-2 mb-2">
          <span>${icon}</span>
          <h3 class="text-sm font-semibold text-white">${title}</h3>
        </div>
        ${content}
      </div>
    `;
  }
  
  renderTechGrid(row) {
    return `
      <div class="grid grid-cols-2 gap-3 text-sm">
        ${this.renderMetric('VWAP', row.signals.vwap ? 'Above' : 'Below')}
        ${this.renderMetric('9/20 EMA', row.signals.emaCross ? 'Bullish' : 'Forming')}
        ${this.renderMetric('RSI(14)', row.signals.rsi ? Math.round(row.signals.rsi) : '–')}
        ${this.renderMetric('ATR%', row.signals.atrPct ? `${Math.round(row.signals.atrPct)}%` : '–')}
      </div>
    `;
  }
  
  renderMetric(label, value) {
    return `
      <div class="flex items-center justify-between rounded-lg bg-slate-600/40 px-3 py-2">
        <span class="text-gray-400 text-xs">${label}</span>
        <span class="text-sm font-medium text-white">${value}</span>
      </div>
    `;
  }
  
  fmtPct(x) {
    if (x === null || x === undefined) return "–";
    return `${(x*100).toFixed(0)}%`;
  }
  
  composeThesisBlocks(row) {
    const whyNow = [];
    if (row.rvol && row.rvol >= 3) whyNow.push(`${row.rvol.toFixed(1)}× relative volume with price ${row.signals.vwap ? "holding" : "testing"} VWAP`);
    if (row.signals.emaCross) whyNow.push("9/20 EMA bull cross in effect");
    if (row.signals.callPut && row.signals.callPut >= 2) whyNow.push(`options skew (C/P ${row.signals.callPut.toFixed(1)}) near dated`);
    if (row.thesis) whyNow.unshift(row.thesis);

    const risks = [];
    if (!row.signals.vwap) risks.push("Below VWAP — wait for reclaim or tighten stop");
    if ((row.signals.rsi || 0) > 74) risks.push("RSI elevated — chase risk/mean reversion");
    if (row.squeeze.sharesOut && row.squeeze.sharesOut > 150_000_000 && (row.rvol||0) < 5) risks.push("Large share base — needs outsized volume or options fuel");
    if (!row.catalystEvents?.length) risks.push("No dated catalyst — momentum only");

    return {
      thesis: `${whyNow.join(" • ")}`,
      risks: risks.length ? risks : ["Standard momentum risks apply"]
    };
  }
  
  updateRefreshButton() {
    const btn = document.getElementById('refresh-btn');
    const text = document.getElementById('refresh-text');
    if (this.loading) {
      btn.disabled = true;
      btn.classList.add('opacity-50');
      text.textContent = 'Scanning...';
    } else {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
      text.textContent = 'Refresh';
    }
  }
  
  updateSessionBadge() {
    const badge = document.getElementById('session-badge');
    if (badge && this.status) {
      badge.textContent = this.status.params?.session || this.status.session || 'unknown';
    }
  }
  
  renderError(message) {
    const grid = document.getElementById('discoveries-grid');
    grid.innerHTML = `
      <div class="col-span-2 text-center py-8 text-red-400">
        ❌ Error: ${message}
      </div>
    `;
  }
}

// Export for use
window.ThesisDiscoveryUI = ThesisDiscoveryUI;