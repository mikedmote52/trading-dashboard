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
      <div class="max-w-7xl mx-auto p-4 space-y-4">
        <header class="sticky top-0 z-10 bg-slate-900/80 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60 py-2 flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-white">Live AlphaStack Discoveries</h1>
            <p class="text-sm text-gray-400">
              Ranked by composite score<span id="session-badge"></span>
            </p>
          </div>
          <button id="refresh-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2">
            <span>⚡</span> <span id="refresh-text">Refresh</span>
          </button>
        </header>

        <div id="discoveries-grid" class="grid md:grid-cols-2 gap-6">
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
      
      <!-- Trade Modal -->
      <div id="trade-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-black/80" onclick="window.thesisUI.closeTradeModal()"></div>
        <div class="relative bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-w-md w-full m-4">
          <div id="trade-modal-content" class="p-6">
            <!-- Trade modal content will be inserted here -->
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
      // 1) Check if we need to kick a new scan (avoid 429s)
      const status = await (await fetch(`/api/scan/status`)).json();
      if (!status?.inProgress && (!status?.timestamp || Date.now() - new Date(status.timestamp).getTime() > 60000)) {
        await fetch(`/api/scan/today?refresh=1&relvolmin=2&rsimin=58&rsimax=78&atrpctmin=3.5&requireemacross=false`);
      }
      
      // 2) Poll status with exponential backoff
      for (let i = 0, wait = 800; i < 15; i++, wait = Math.min(wait * 1.4, 4000)) {
        const s = await (await fetch(`/api/scan/status`)).json();
        this.status = s;
        this.updateSessionBadge();
        if (!s.inProgress) break;
        await new Promise((r) => setTimeout(r, wait));
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
    // Map the actual API field names from /api/scan/results
    const entry = x.entryPlan?.entryPrice ?? x.entry_plan?.entry_price ?? x.targetPrices?.tp1 ?? x.price;
    const stop = x.entryPlan?.stopLoss ?? x.entry_plan?.stop_loss ?? x.risk?.stopLoss ?? entry * 0.9;
    const tp1 = x.entryPlan?.tp1 ?? x.entry_plan?.tp1 ?? x.targetPrices?.tp1 ?? x.risk?.takeProfit1 ?? entry * 1.15;
    const tp2 = x.entryPlan?.tp2 ?? x.entry_plan?.tp2 ?? x.targetPrices?.tp2 ?? x.risk?.takeProfit2 ?? entry * 1.30;
    const rr = entry && stop && tp1 ? (tp1 - entry) / Math.max(0.01, entry - stop) : null;
    
    // Determine shares based on readiness tier
    const readinessTier = x.readiness_tier || 'WATCH';
    let defaultSize = 100;
    if (readinessTier === 'TRADE_READY') {
      defaultSize = 100;
    } else if (readinessTier === 'EARLY_READY') {
      defaultSize = 50;
    }
    const shares = x.sharesToBuy || Math.max(1, Math.floor(defaultSize / (x.price || 1)));

    return {
      symbol: x.ticker || x.symbol,
      name: x.name || x.ticker || x.symbol,
      price: x.price || x.currentPrice,
      score: Number.isFinite(x.alphaScore) ? Math.round(x.alphaScore) : 
             Number.isFinite(x.alpha_score) ? Math.round(x.alpha_score) : 
             Number.isFinite(x.score) ? Math.round(x.score) : null,
      rvol: x.relVolume || x.rel_volume || x.volumeX || 1,
      
      // Enhanced thesis from backend
      thesis: x.thesis || x.catalyst || "Technical setup developing",
      thesisReasons: x.thesisReasons || [], // Structured reasoning from backend
      
      // New tier and priority fields
      readinessTier: readinessTier,
      highPriority: x.high_priority || ((x.relVolume || x.volumeX || 1) >= 3.0),
      relaxationActive: x.relaxationActive || false,
      scoreBreakdown: x.score_breakdown || {},
      bumps: x.bumps || {},
      
      catalystEvents: x.catalyst_events || [],
      signals: {
        vwap: x.aboveVWAP || x.above_vwap || x.technicals?.vwap,
        emaCross: x.emaCross920 === "confirmed" || x.ema_cross_9_20 === "confirmed" || 
                  (x.technicals?.ema9 > x.technicals?.ema20),
        rsi: x.rsi14 || x.rsi_14 || x.technicals?.rsi || 50,
        atrPct: x.atrPct || x.atr_pct || x.technicals?.atrPct || 2,
        callPut: x.options_call_put_ratio || x.options?.callPutRatio || 1.5,
        oiDelta: x.near_money_oi_change || x.options?.gammaExposure || 0,
      },
      squeeze: {
        sharesOut: x.sharesOutstanding || x.shares_outstanding || x.floatShares || 50000000,
        shortInterest: x.shortInterest,
        borrowFee: x.borrowFee,
        utilization: x.utilization
      },
      plan: {
        entry,
        stop,
        tp1,
        tp2,
        rr,
        shares,
        defaultSize
      },
      session: x.sessionType || x.session || "unknown",
      asOf: x.as_of || x.discoveredAt || new Date().toISOString(),
      action: x.action || (readinessTier === 'TRADE_READY' ? 'BUY' : 
                           readinessTier === 'EARLY_READY' ? 'BUY_EARLY' : 'WATCHLIST'),
      
      // Enhanced metadata from backend
      confidence: x.confidence || x.scoreConfidence || 1.0,
      isHighConfidence: x.isHighConfidence || (x.alphaScore >= 75),
      dataQuality: x.dataQuality || {},
      estimatedData: x.estimatedData || false
    };
  }
  
  renderDiscoveries() {
    const grid = document.getElementById('discoveries-grid');
    
    if (!this.rows || this.rows.length === 0) {
      // Show diagnostic information when empty
      const s = this.status || {};
      const tradeReady = s.tradeReadyCount || s.gateCounts?.s1_momentum_tradeReady || 0;
      const earlyReady = s.earlyReadyCount || s.gateCounts?.s1_momentum_earlyReady || 0;
      const relaxed = s.relaxation_active ? 'ON' : 'OFF';
      const polygonStatus = s.polygonStatus || s.polygon || 'unknown';
      
      let diagnosticMsg = `TR: ${tradeReady} • ER: ${earlyReady} • Relaxed: ${relaxed} • Polygon: ${polygonStatus}`;
      
      let emptyMessage = 'No candidates found';
      if (s.relaxation_active) {
        emptyMessage = '❄️ Cold Tape active but no seeds available. System should be generating catalyst candidates...';
      }
      
      grid.innerHTML = `
        <div class="col-span-2 text-sm text-gray-400 p-8 border border-slate-600 rounded-xl text-center space-y-2">
          <div class="text-base">${emptyMessage}</div>
          <div class="text-xs opacity-75">${diagnosticMsg}</div>
          <button onclick="window.thesisUI.fetchResults()" 
                  class="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm">
            Refresh Scan
          </button>
        </div>
      `;
      return;
    }
    
    // Sort by score first, then by relative volume
    const sorted = this.rows
      .slice()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.rvol ?? 0) - (a.rvol ?? 0));
    
    // Check if all items are Watch-only during cold tape
    const hasAnyBuyable = sorted.some(r => r.readinessTier === 'TRADE_READY' || r.readinessTier === 'EARLY_READY');
    const isAllWatchOnly = !hasAnyBuyable && sorted.length > 0;
    const isRelaxed = this.status?.relaxation_active;
    
    let banner = '';
    if (isRelaxed && isAllWatchOnly) {
      banner = `
        <div class="col-span-2 mb-4 p-3 bg-slate-700/50 border border-slate-500 rounded-lg text-center">
          <span class="text-amber-400">❄️ Cold Tape active.</span>
          <span class="text-gray-300">Showing catalyst seeds (scores capped ≤74). Buys re-enable when momentum returns.</span>
        </div>
      `;
    } else if (isRelaxed) {
      banner = `
        <div class="col-span-2 mb-4 p-3 bg-slate-700/50 border border-slate-500 rounded-lg text-center">
          <span class="text-amber-400">❄️ Cold Tape relaxation active.</span>
          <span class="text-gray-300">Enhanced seeding for Early-Ready and Watch candidates.</span>
        </div>
      `;
    }
    
    grid.innerHTML = banner + sorted.slice(0, 10).map(row => this.renderCandidateCard(row)).join('');
  }
  
  normalize(text) {
    if (!text) return '';
    return text
      .replace(/(?:\r?\n|\r)+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\b(Inc\.|Corp\.|Corporation|Holdings|Ltd\.|PLC)\b/gi, '')
      .trim();
  }
  
  renderCandidateCard(row) {
    // Streamlined 3-row design: Header | Projection | Thesis Paragraph
    const borderColor = row.readinessTier === 'TRADE_READY' ? 'border-l-emerald-400' 
                      : row.readinessTier === 'EARLY_READY' ? 'border-l-amber-400'
                      : 'border-l-slate-300';
    
    const scoreTone = row.score >= 85 ? 'text-emerald-500'
                    : row.score >= 75 ? 'text-emerald-400'
                    : 'text-slate-400';
    
    // Enhanced action chips with readiness tiers
    let actionChip = '';
    if (row.readinessTier === 'TRADE_READY') {
      actionChip = '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-semibold">Trade Ready</span>';
    } else if (row.readinessTier === 'EARLY_READY') {
      actionChip = '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-semibold">Early Stealth</span>';
    } else if (row.readinessTier === 'WATCH') {
      actionChip = '<span class="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Watch</span>';
    } else {
      actionChip = '<span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">Monitor</span>';
    }
    
    // Add high priority badge
    if (row.highPriority) {
      actionChip += ' <span class="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 ml-1">High rVol</span>';
    }
    
    // Add cold tape relaxation badge
    if (row.relaxationActive) {
      actionChip += ' <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 ml-1">Cold Tape</span>';
    }
    
    const { target, pct } = this.projectedTarget(row);
    const pctStr = pct !== null && pct !== undefined ? `+${pct.toFixed(0)}%` : '–';
    const sizingCost = (row.plan.shares * row.price).toFixed(2);
    
    return `
      <div class="bg-slate-800 border border-slate-600 border-l-4 ${borderColor} rounded-2xl shadow-sm hover:shadow-md transition">
        <div class="p-4 flex flex-col gap-3 min-h-[140px]">
          <!-- Row 1: Header (simple) -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xl font-semibold tracking-tight text-white">${row.symbol}</span>
              ${actionChip}
            </div>
            <div class="text-right">
              <div class="text-2xl font-semibold text-white">$${row.price?.toFixed(2)}</div>
              <div class="text-xs ${scoreTone}">Score ${row.score ?? '—'}</div>
            </div>
          </div>

          <!-- Row 2: Projection -->
          <div class="text-sm text-slate-300/90">
            Target (TP1): ${target ? `$${target.toFixed(2)}` : '—'}
            ${Number.isFinite(pct) ? `<span class="ml-2 font-medium text-emerald-500">(+${pct.toFixed(0)}%)</span>` : ''}
            <span class="mx-2">•</span>
            $${row.plan.defaultSize} sizing: ${row.plan.shares} sh ($${sizingCost})
          </div>

          <!-- Row 3: Robust thesis paragraph -->
          <p class="text-sm leading-6 text-slate-200/90 line-clamp-3 break-words">
            ${this.composeThesisParagraph(row)}
          </p>

          <!-- Footer — session + Buy button + Details -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500">
              ${(row.session && row.session !== 'unknown') ? `${row.session} • as of ${new Date(row.asOf).toLocaleTimeString()}` : ''}
            </span>
            <div class="flex items-center gap-2">
              ${row.readinessTier === 'TRADE_READY' || row.readinessTier === 'EARLY_READY' ? `
                <button 
                  onclick="event.stopPropagation(); window.thesisUI.handleBuyDirect('${row.symbol}', ${row.price}, ${row.plan.defaultSize})" 
                  class="${row.readinessTier === 'TRADE_READY' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white px-3 py-1 rounded text-sm font-semibold shadow-sm"
                  aria-label="Buy ${row.symbol} - $${row.plan.defaultSize}"
                  title="${row.readinessTier === 'TRADE_READY' ? 'Trade Ready - $100 size' : 'Early Stealth - $50 size'}"
                >
                  Buy $${row.plan.defaultSize}
                </button>
              ` : ''}
              <button 
                onclick="event.stopPropagation(); window.thesisUI.openModal('${row.symbol}')"
                class="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                aria-label="Open details for ${row.symbol}"
                title="Show technical breakdown and scoring details"
              >
                Details
              </button>
            </div>
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
  
  // New helper: project target and percent vs CURRENT price
  projectedTarget(row) {
    const target = row.plan?.tp1 ?? (row.price ? row.price * 1.2 : null);
    const pct = row.price && target ? ((target - row.price) / row.price) * 100 : null;
    return { target, pct };
  }

  // New helper: robust paragraph built ONLY from scanner fields
  composeThesisParagraph(row) {
    // Use enhanced backend thesis if available
    const baseThesis = this.normalize(row.thesis);
    if (baseThesis && baseThesis.length > 50) {
      // Backend provided comprehensive thesis - use it normalized
      return baseThesis;
    }
    
    // Fallback to constructing thesis from available data
    const bits = [];
    
    // 1) Action context and setup strength
    const actionContext = this.getActionContext(row);
    if (actionContext) bits.push(actionContext);
    
    // 2) Key technical drivers
    const drivers = this.getKeyDrivers(row);
    if (drivers) bits.push(drivers);
    
    // 3) Risk/reward and timing
    const rrContext = this.getRiskRewardContext(row);
    if (rrContext) bits.push(rrContext);
    
    // 4) Short interest and flow (if significant)
    const squeezeContext = this.getSqueezeContext(row);
    if (squeezeContext) bits.push(squeezeContext);
    
    // 5) Timeline and catalyst context
    const catalystContext = this.getCatalystContext(row);
    if (catalystContext) bits.push(catalystContext);
    
    return bits.join(' ') || `${row.symbol} technical setup developing with ${row.score} composite score.`;
  }
  
  getActionContext(row) {
    const score = row.score || 50;
    const confidence = row.confidence || 1.0;
    
    if (row.action === 'TRADE_READY' || score >= 80) {
      return `Strong ${score}-score setup warrants immediate consideration.`;
    } else if (row.action === 'WATCHLIST' || score >= 70) {
      return `Solid ${score}-score opportunity developing - monitor for entry signals.`;
    } else {
      return `Emerging ${score}-score pattern requires confirmation.`;
    }
  }
  
  getKeyDrivers(row) {
    const drivers = [];
    
    // Volume is key
    if (row.rvol >= 2.5) {
      drivers.push(`${row.rvol.toFixed(1)}× volume surge indicating institutional activity`);
    } else if (row.rvol >= 1.5) {
      drivers.push(`${row.rvol.toFixed(1)}× above-average volume supporting momentum`);
    }
    
    // VWAP positioning
    if (row.signals?.vwap) {
      drivers.push(`holding above VWAP resistance`);
    } else {
      drivers.push(`approaching VWAP breakout level`);
    }
    
    // EMA cross confirmation
    if (row.signals?.emaCross) {
      drivers.push(`confirmed 9/20 EMA bullish crossover`);
    }
    
    // RSI momentum
    const rsi = row.signals?.rsi;
    if (rsi && rsi > 60 && rsi < 75) {
      drivers.push(`RSI ${Math.round(rsi)} in bullish momentum zone`);
    }
    
    return drivers.length ? drivers.slice(0, 2).join(', ') + '.' : null;
  }
  
  getRiskRewardContext(row) {
    if (row.plan?.rr && row.plan.rr > 0) {
      const rrFormatted = row.plan.rr.toFixed(1);
      const tp1 = row.plan.tp1 ? `$${row.plan.tp1.toFixed(2)}` : 'target';
      return `R/R ${rrFormatted}:1 to ${tp1} provides favorable risk profile.`;
    }
    return null;
  }
  
  getSqueezeContext(row) {
    const parts = [];
    
    if (row.squeeze?.shortInterest && row.squeeze.shortInterest > 15) {
      parts.push(`${row.squeeze.shortInterest}% short interest`);
    }
    
    if (row.squeeze?.borrowFee && row.squeeze.borrowFee > 5) {
      parts.push(`${row.squeeze.borrowFee}% borrow fee`);
    }
    
    if (row.signals?.callPut && row.signals.callPut > 2) {
      parts.push(`${row.signals.callPut.toFixed(1)}:1 call/put ratio`);
    }
    
    if (parts.length > 0) {
      return `Squeeze indicators: ${parts.join(', ')}.`;
    }
    
    return null;
  }
  
  getCatalystContext(row) {
    if (row.catalystEvents?.length) {
      const e = row.catalystEvents[0];
      const tag = e?.label || e?.title || "catalyst event";
      const when = e?.date || e?.when || "near-term";
      return `${tag} expected ${when} could accelerate momentum.`;
    }
    
    // Data quality context for transparency
    if (row.estimatedData && row.dataQuality) {
      return `Analysis based on available market data with standard risk assumptions.`;
    }
    
    return null;
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
  
  openTradeModal(symbol) {
    const row = this.rows.find(r => r.symbol === symbol);
    if (!row) return;
    
    this.tradeRow = row;
    this.renderTradeModal(row);
    document.getElementById('trade-modal').classList.remove('hidden');
  }
  
  closeTradeModal() {
    document.getElementById('trade-modal').classList.add('hidden');
    this.tradeRow = null;
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
  
  renderTradeModal(row) {
    const defaultQty = Math.max(1, row.plan?.shares || 1);
    const defaultStop = row?.plan?.stop || (row.price ? row.price * 0.90 : 0);
    const defaultTp = row?.plan?.tp1 || (row.price ? row.price * 1.20 : 0);
    
    document.getElementById('trade-modal-content').innerHTML = `
      <div class="flex items-center gap-2 mb-6 pb-4 border-b border-slate-600">
        <span class="text-xl font-semibold text-white">Buy ${row.symbol}</span>
        <span class="text-sm text-slate-400">$${row.price?.toFixed(2)}</span>
        <button onclick="window.thesisUI.closeTradeModal()" class="ml-auto text-gray-400 hover:text-white">✕</button>
      </div>

      <div class="space-y-4">
        <!-- Order Type & TIF -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-slate-400 mb-1">Order type</label>
            <select id="orderType" class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm">
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">Time in force</label>
            <select id="tif" class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm">
              <option value="day">DAY</option>
              <option value="gtc">GTC</option>
            </select>
          </div>
        </div>

        <!-- Limit Price (hidden by default) -->
        <div id="limitPriceSection" class="hidden">
          <label class="block text-xs text-slate-400 mb-1">Limit price</label>
          <input id="limitPrice" type="number" step="0.01" value="${row.price?.toFixed(2)}" 
                 class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm">
        </div>

        <!-- Quantity -->
        <div class="grid grid-cols-3 gap-3 items-end">
          <div class="col-span-2">
            <label class="block text-xs text-slate-400 mb-1">Quantity (shares)</label>
            <input id="qty" type="number" min="1" step="1" value="${defaultQty}" 
                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm">
          </div>
          <button onclick="window.thesisUI.setSizing100('${row.symbol}')" 
                  class="bg-slate-600 hover:bg-slate-500 text-white px-3 py-2 rounded text-sm">
            $100 sizing
          </button>
        </div>

        <!-- Bracket Controls -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs text-slate-400">Bracket (TP/SL)</label>
            <label class="flex items-center gap-2">
              <input id="useBracket" type="checkbox" checked class="rounded bg-slate-700 border-slate-600">
            </label>
          </div>
          <div id="bracketControls" class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Take profit</label>
              <input id="tpPrice" type="number" step="0.01" value="${defaultTp?.toFixed(2)}" 
                     class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm">
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Stop loss</label>
              <input id="stopPrice" type="number" step="0.01" value="${defaultStop?.toFixed(2)}" 
                     class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm">
            </div>
          </div>
        </div>

        <!-- Estimated Cost -->
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-400">Estimated cost</span>
          <span id="estimatedCost" class="font-medium text-white">$${(defaultQty * row.price).toFixed(2)}</span>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 pt-4">
          <button onclick="window.thesisUI.closeTradeModal()" 
                  class="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded text-sm">
            Cancel
          </button>
          <button onclick="window.thesisUI.submitTrade('${row.symbol}')" 
                  class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm">
            Buy
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners for interactive elements
    this.setupTradeModalEvents();
  }
  
  setupTradeModalEvents() {
    // Order type change handler
    const orderTypeSelect = document.getElementById('orderType');
    const limitSection = document.getElementById('limitPriceSection');
    orderTypeSelect?.addEventListener('change', (e) => {
      if (e.target.value === 'limit') {
        limitSection?.classList.remove('hidden');
      } else {
        limitSection?.classList.add('hidden');
      }
    });
    
    // Bracket toggle handler
    const bracketCheckbox = document.getElementById('useBracket');
    const bracketControls = document.getElementById('bracketControls');
    bracketCheckbox?.addEventListener('change', (e) => {
      if (e.target.checked) {
        bracketControls?.classList.remove('hidden');
      } else {
        bracketControls?.classList.add('hidden');
      }
    });
    
    // Quantity change handler for cost estimation
    const qtyInput = document.getElementById('qty');
    qtyInput?.addEventListener('input', () => this.updateEstimatedCost());
  }
  
  setSizing100(symbol) {
    const row = this.rows.find(r => r.symbol === symbol);
    if (!row) return;
    
    const qtyInput = document.getElementById('qty');
    const sizing = Math.max(1, Math.floor(100 / (row.price || 1)));
    if (qtyInput) {
      qtyInput.value = sizing;
      this.updateEstimatedCost();
    }
  }
  
  updateEstimatedCost() {
    const qtyInput = document.getElementById('qty');
    const estimatedCost = document.getElementById('estimatedCost');
    const row = this.tradeRow;
    
    if (qtyInput && estimatedCost && row) {
      const qty = parseInt(qtyInput.value) || 0;
      const cost = qty * (row.price || 0);
      estimatedCost.textContent = `$${cost.toFixed(2)}`;
    }
  }
  
  /**
   * Enhanced order placement with bracket orders and tier-based sizing
   */
  async placeOrder(symbol, dollars, price, tp1Percent = 15) {
    const qty = Math.max(1, Math.floor(dollars / price));
    const body = {
      symbol,
      price,
      stopLossPercent: 10,  // 10% stop loss
      takeProfitPercent: tp1Percent
    };
    
    try {
      const response = await fetch('/api/discoveries/buy100', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Order failed');
      }
      
      const result = await response.json();
      
      // Trigger portfolio refresh
      window.dispatchEvent(new CustomEvent('portfolio:refresh'));
      
      return result;
    } catch (error) {
      console.error(`❌ Order placement failed for ${symbol}:`, error);
      throw error;
    }
  }

  async submitTrade(symbol) {
    const row = this.rows.find(r => r.symbol === symbol);
    if (!row) return;
    
    try {
      // Get form values
      const qty = parseInt(document.getElementById('qty')?.value) || 0;
      const orderType = document.getElementById('orderType')?.value || 'market';
      const tif = document.getElementById('tif')?.value || 'day';
      const limitPrice = parseFloat(document.getElementById('limitPrice')?.value) || row.price;
      const useBracket = document.getElementById('useBracket')?.checked || false;
      const tpPrice = parseFloat(document.getElementById('tpPrice')?.value) || 0;
      const stopPrice = parseFloat(document.getElementById('stopPrice')?.value) || 0;
      
      if (qty <= 0) {
        alert('❌ Please enter a valid quantity');
        return;
      }
      
      // Determine dollar amount based on quantity and price
      const dollarAmount = qty * row.price;
      
      // Use enhanced placeOrder for bracket orders with proper sizing
      if (useBracket) {
        const takeProfitPercent = tpPrice ? ((tpPrice - row.price) / row.price) * 100 : 15;
        await this.placeOrder(row.symbol, dollarAmount, row.price, takeProfitPercent);
      } else {
        // Use discovery buy100 endpoint for simpler orders
        const payload = {
          symbol: row.symbol,
          price: row.price,
          stopLossPercent: 10,
          takeProfitPercent: 15
        };
        
        const response = await fetch('/api/discoveries/buy100', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Order failed');
        }
      }
      
      // Success
      this.closeTradeModal();
      alert(`✅ Submitted buy order: ${qty} ${row.symbol} (~$${dollarAmount.toFixed(0)})`);
      
      // Trigger portfolio refresh
      window.dispatchEvent(new CustomEvent('portfolio:refresh'));
      
    } catch (error) {
      console.error('Trade error:', error);
      alert(`❌ Order error: ${error.message || error}`);
    }
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
      let badgeText = '';
      
      // Add session label if available
      const sessionLabel = this.status.params?.session || this.status.session;
      if (sessionLabel && sessionLabel !== 'unknown') {
        badgeText += ` • Session: ${sessionLabel}`;
      }
      
      // Add cold tape relaxation status
      if (this.status.relaxation_active) {
        badgeText += ' • ❄️ Cold Tape Active';
      }
      
      // Add counts
      if (this.status.tradeReadyCount > 0) {
        badgeText += ` • ${this.status.tradeReadyCount} Trade-Ready`;
      }
      if (this.status.earlyReadyCount > 0) {
        badgeText += ` • ${this.status.earlyReadyCount} Early-Ready`;
      }
      
      badge.textContent = badgeText;
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
  
  /**
   * Direct buy handler for tier-based sizes
   */
  async handleBuyDirect(symbol, price, dollarAmount) {
    try {
      // Find the row to get take profit info
      const row = this.rows.find(r => r.symbol === symbol);
      if (!row) {
        throw new Error(`Row not found for ${symbol}`);
      }
      
      // Calculate take profit based on tier and bumps
      let tp1Percent = 20; // Base 20%
      if (row.bumps && row.bumps.length > 0) {
        tp1Percent += row.bumps.length * 5; // +5% per bump
      }
      tp1Percent = Math.min(tp1Percent, 45); // Cap at 45%
      
      const qty = Math.max(1, Math.floor(dollarAmount / price));
      const body = {
        symbol,
        side: "buy",
        type: "market",
        qty,
        tif: "day",
        order_class: "bracket",
        take_profit: { limit_price: +(price * (1 + tp1Percent / 100)).toFixed(2) },
        stop_loss: { stop_price: +(price * 0.90).toFixed(2) } // 10% SL
      };
      
      console.log(`🚀 Placing bracket order for ${symbol}:`, body);
      
      const response = await fetch("/api/portfolio/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Order failed: ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`✅ Order placed successfully:`, result);
      
      // Refresh portfolio
      window.dispatchEvent(new CustomEvent("portfolio:refresh"));
      
      // Show success message
      alert(`✅ Bracket order placed for ${symbol}\n- Size: ${qty} shares ($${dollarAmount})\n- Take Profit: +${tp1Percent}%\n- Stop Loss: -10%`);
      
    } catch (error) {
      console.error(`❌ Buy order failed:`, error);
      alert(`❌ Order failed: ${error.message}`);
    }
  }
}

// Export for use
window.ThesisDiscoveryUI = ThesisDiscoveryUI;