const Gates = require('./gates');
const Scorer = require('./scorer');
const ActionMapper = require('./action_mapper');
const DS = require('./data_sources');
const { loadConfig } = require('./util/config');
const db = require('../../db/sqlite');
const shortInterestProvider = require('../providers/shortinterest');

module.exports = class Engine {
  constructor(now=new Date()){
    this.now = now;
    this.cfg = loadConfig();
    this.gates = new Gates(this.cfg);
    this.scorer = new Scorer(this.cfg);
    this.mapper = new ActionMapper(this.cfg);
  }

  async run(){
    try {
      const universe = await DS.get_universe();
      const holdings = await DS.get_portfolio_holdings();
      
      // Filter out current holdings early
      let filtered_holdings = 0;
      const tradeable = universe.filter(tk => {
        if (holdings?.has && holdings.has(tk)) {
          filtered_holdings++;
          return false;
        }
        return true;
      });
      
      const enriched = await this._enrich(tradeable, holdings);
      
      // Pre-enrichment audit - now more lenient with estimated data
      const reqs = [
        ['short_interest_pct', t => Number.isFinite(t.short_interest_pct) || t.estimated],
        ['days_to_cover',     t => Number.isFinite(t.days_to_cover) || t.estimated],
        ['borrow_fee_pct',    t => Number.isFinite(t.borrow_fee_pct) || t.estimated],
        ['borrow_trend_pp7d', t => Number.isFinite(t.borrow_fee_trend_pp7d) || t.estimated],
        ['float_shares',      t => Number.isFinite(t.float_shares)], // This we can get from fundamentals
        ['liquidity_30d',     t => Number.isFinite(t.avg_dollar_liquidity_30d) || t.technicals?.volume], // Use volume as proxy
        ['catalyst_flag',     t => !!t.catalyst?.verified_in_window || !!t.catalyst], // Accept any catalyst
      ];

      const miss = { filtered_holdings };
      let ready = 0;
      for (const t of enriched) {
        let ok = true;
        for (const [k, pred] of reqs) {
          if (!pred(t)) {
            miss[k] = (miss[k] || 0) + 1;
            ok = false;
          }
        }
        if (ok) ready++;
      }
      
      console.log(`🧪 Pre-enrichment audit: ${ready}/${enriched.length} candidates ready (with estimations)`);
      if (ready === 0 && enriched.length > 0) {
        console.log('❌ All candidates failed pre-enrichment. Top missing data:');
        Object.entries(miss).slice(0, 5).forEach(([key, count]) => {
          if (key !== 'filtered_holdings') {
            console.log(`   • ${key}: ${count} stocks missing`);
          }
        });
      }

      await db.insertDiscovery({
        id: `audit-pre-${Date.now()}`,
        symbol: 'AUDIT_PRE_ENRICH',
        price: 0,
        score: 0,
        preset: this.cfg.preset,
        action: 'NO ACTION',
        features_json: JSON.stringify({ run_size: enriched.length, candidates_ready: ready }),
        audit_json: JSON.stringify({ missing: miss })
      });
      
      const { passed, drops } = this.gates.apply(enriched);

      // Add gate diagnostics for all enriched items (including failed ones)
      const all_with_diagnostics = enriched.map(t => {
        // Use actual Gates class to get real failure reasons
        const singleItemGate = this.gates.apply([t]);
        const gate_failures = singleItemGate.drops[t.ticker] || [];
        
        return {
          ...t,
          gate_failures,
          passed_gates: gate_failures.length === 0
        };
      });

      // persist audit summary so diagnostics can see gate pressure
      try {
        const summary = {
          id: `audit-${Date.now()}`,
          symbol: 'AUDIT_SUMMARY',
          price: 0,
          score: 0,
          preset: this.cfg.preset,
          action: 'NO ACTION',
          features_json: JSON.stringify({ run_size: enriched.length, passed: passed.length }),
          audit_json: JSON.stringify({ drops })
        };
        await db.insertDiscovery(summary);
      } catch (e) {
        console.warn('audit summary persist failed', e.message);
      }

      const candidates = [];
      for (const t of passed){
        const { composite, subscores, weights } = this.scorer.score(t);
        const action = this.mapper.map(composite, t.technicals);
        
        // Add gate diagnostics
        const gates = {
          data_ready: ['short_interest_pct','days_to_cover','borrow_fee_pct','borrow_fee_trend_pp7d','float_shares','adv_30d_shares']
                       .every(k => Number.isFinite(t[k])),
          float_max: t.float_shares <= 250_000_000,
          adv_min:   t.adv_30d_shares / t.float_shares >= 0.01,
          si_min:    t.short_interest_pct >= 20,
          dtc_min:   t.days_to_cover >= 1.5,
          borrow_min:t.borrow_fee_pct >= 5
        };
        const gate_failures = Object.entries(gates).filter(([k,v]) => !v).map(([k]) => k);
        const passed_gates = gate_failures.length === 0;
        
        const audit = { 
          subscores, 
          weights, 
          gates, 
          gate_failures, 
          freshness: t.freshness||{}, 
          drops: drops[t.ticker]||[] 
        };

        if (action === 'BUY' || action === 'WATCHLIST' || action === 'MONITOR'){
          const row = this._formatRow(t, composite, this.cfg.preset, action, audit);
          // Add score_explain to the emit object
          row.emit.score_explain = {
            short_interest_pct: t.short_interest_pct,
            days_to_cover: t.days_to_cover,
            borrow_fee_pct: t.borrow_fee_pct,
            borrow_fee_trend_pp7d: t.borrow_fee_trend_pp7d,
            float_shares: t.float_shares,
            adv_30d_shares: t.adv_30d_shares,
            missing_fields: ['short_interest_pct','days_to_cover','borrow_fee_pct','borrow_fee_trend_pp7d','float_shares','adv_30d_shares']
                            .filter(k => !Number.isFinite(t[k])),
            gates,
            gate_failures
          };
          row.emit.passed_gates = passed_gates;
          
          await db.insertDiscovery(row.db);
          candidates.push(row.emit);
        }
      }
      
      return { 
        asof: new Date().toISOString(), 
        preset: this.cfg.preset, 
        universe_count: universe.length, 
        candidates,
        all_diagnostics: all_with_diagnostics // Include diagnostic data for debugging
      };
    } catch (e) {
      console.error('engine.run error', e.stack || e.message);
      throw e;
    }
  }

  async _enrich(tickers, holdings){
    const [shorts, liq, intraday, options, catalysts, sentiment, borrow] = await Promise.all([
      DS.get_short_data(tickers),
      DS.get_liquidity(tickers),
      DS.get_intraday(tickers),
      DS.get_options(tickers),
      DS.get_catalysts(tickers),
      DS.get_sentiment(tickers),
      DS.get_borrow(tickers)
    ]);
    
    // Create initial enriched data
    const enriched = tickers.map(tk => ({
      ticker: tk,
      _held: holdings?.has && holdings.has(tk),
      ...(shorts[tk]||{}),
      ...(liq[tk]||{}),
      ...(borrow[tk]||{}),              // gives borrow_fee_pct and borrow_fee_trend_pp7d
      technicals: intraday[tk]||{},
      options: options[tk]||{},
      catalyst: catalysts[tk]||{},
      sentiment: sentiment[tk]||{}
    }));
    
    // Proxy integration now handled in DS.get_short_data(), no manual processing needed
    
    return enriched;
  }

  _formatRow(t, composite, preset, action, audit){
    const price = t.technicals?.price;
    const entry_hint = { type: t.technicals?.vwap_held_or_reclaimed ? 'vwap_reclaim' : 'base_breakout', trigger_price: t.technicals?.vwap || price };
    const risk = { stop_loss: +(price*0.9).toFixed(2), tp1: +(price*1.2).toFixed(2), tp2: +(price*1.5).toFixed(2) };
    const emit = {
      ticker: t.ticker,
      price,
      float_shares: t.float_shares,
      short_interest_pct: t.short_interest_pct,
      days_to_cover: t.days_to_cover,
      borrow_fee_pct: t.borrow_fee_pct,
      borrow_fee_trend: t.borrow_fee_trend_pp7d,
      utilization_pct: t.utilization_pct,
      avg_dollar_liquidity_30d: t.avg_dollar_liquidity_30d,
      catalyst: t.catalyst,
      options: t.options,
      sentiment: t.sentiment,
      technicals: t.technicals,
      intraday_rel_volume: t.technicals?.rel_volume,
      composite_score: +composite.toFixed(1),
      action,
      entry_hint,
      risk
    };
    
    // Prevent undefined JSON strings from entering database
    const features_json = JSON.stringify(t || {});
    const audit_json = JSON.stringify(audit || {});
    
    return {
      db: {
        id: `${t.ticker}-${Date.now()}`,
        symbol: t.ticker,
        price,
        score: +composite.toFixed(2),
        preset,
        action,
        features_json,
        audit_json
      },
      emit
    };
  }
};