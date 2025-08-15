/* VIGL SHIM — drop this in BEFORE your legacy dashboard bundle.
   Stops null addEventListener/innerHTML errors, provides dedupeDiscoveries +
   renderDiscoveries bridges, and ensures #viglCards / #btnScanMarket exist.
   Safe to remove once you migrate fully to the clean HTML+JS build. */
(function(){
  'use strict';
  const log  = (...a)=>console.log('%c[VIGL SHIM]','color:#4cc3ff',...a);
  const warn = (...a)=>console.warn('%c[VIGL SHIM]','color:#f59e0b',...a);
  const err  = (...a)=>console.error('%c[VIGL SHIM]','color:#ef4444',...a);

  // ---------- DOM helpers ------------------------------------------------------
  const $ = (id)=>document.getElementById(id);
  function ensure(id, tag='div', attrs){
    let el = $(id);
    if(!el){
      el = document.createElement(tag);
      el.id = id;
      if(attrs) Object.assign(el, attrs);
      document.body.appendChild(el);
      log('created placeholder', `#${id}`);
    }
    return el;
  }
  function setText(id, v){ const n=$(id); if(n) n.textContent=String(v); }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

  // Ensure required nodes exist so legacy code doesn't explode
  document.addEventListener('DOMContentLoaded',()=>{
    // Cards container for rendering
    const cards = ensure('viglCards','section');
    if(!cards.classList.contains('grid')) cards.classList.add('grid');

    // Scan button placeholder (hidden) to avoid null addEventListener
    if(!$('btnScanMarket')){
      const b = ensure('btnScanMarket','button');
      b.type='button';
      b.style.display='none';
      b.title='Shim placeholder — real button missing in DOM';
    }
  });

  // ---------- Normalization & Dedupe ------------------------------------------
  const toISO = (x)=>{ try {return new Date(x||Date.now()).toISOString();} catch {return new Date().toISOString();} };
  function normalize(r){
    const ticker = (r?.ticker || r?.symbol || '').toUpperCase();
    if(!ticker) return null;
    const raw = r?.status || r?.recommendation || r?.action || r?.tag || 'Monitor';
    const status = /buy/i.test(raw)?'BUY':/watch/i.test(raw)?'Watch':'Monitor';
    const price = Number(r?.price ?? r?.last ?? r?.close);
    const score = Number(r?.score ?? r?.compositeScore ?? r?.rating);
    const catalyst = r?.catalyst || r?.reason || r?.note || '';
    const updatedAt = toISO(r?.updatedAt || r?.timestamp || r?.time);
    return { ticker, status, price: Number.isFinite(price)?price:undefined, score: Number.isFinite(score)?score:undefined, catalyst, updatedAt };
  }
  function normalizeAndDedupe(arr){
    const mapped = (arr||[]).map(normalize).filter(Boolean);
    const byTicker={};
    for(const x of mapped){
      const prev = byTicker[x.ticker];
      if(!prev){ byTicker[x.ticker]=x; continue; }
      byTicker[x.ticker] = new Date(prev.updatedAt) > new Date(x.updatedAt) ? prev : x;
    }
    return Object.values(byTicker);
  }

  // ---------- Rendering --------------------------------------------------------
  function cardNode({ticker,status,price,score,catalyst,updatedAt}){
    const el = document.createElement('article');
    el.className = 'vigl-card';
    el.innerHTML = `
      <div class="row" style="display:flex;justify-content:space-between;align-items:center">
        <h3 class="ticker" style="margin:0;font:600 16px system-ui,Segoe UI,Roboto">${ticker}</h3>
        <span class="badge ${status.toLowerCase()}" style="padding:4px 8px;border-radius:999px;border:1px solid #2a3b55;font:700 12px system-ui">${status}</span>
      </div>
      <div class="meta" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px">
        ${Number.isFinite(price)?`<div><label style="opacity:.7">Price</label> <b>${price.toFixed(2)}</b></div>`:'<div></div>'}
        ${score!=null?`<div><label style="opacity:.7">Score</label> <b>${score}</b></div>`:'<div></div>'}
        <div><label style="opacity:.7">Updated</label> <b>${new Date(updatedAt).toLocaleString()}</b></div>
      </div>
      ${catalyst?`<p class="catalyst" style="margin:6px 0 0;color:#bcd7ff">${escapeHtml(catalyst)}</p>`:''}
    `;
    return el;
  }

  function updateCounters(items){
    const total = items.length;
    const buy = items.filter(x=>x.status==='BUY').length;
    const watch = items.filter(x=>x.status==='Watch').length;
    const monitor = items.filter(x=>x.status==='Monitor').length;
    setText('viglTotalDiscoveries', total);
    setText('viglBuyCount', buy);
    setText('viglWatchlistCount', watch);
    setText('viglMonitorCount', monitor);
  }

  function renderCards(items){
    const mount = $('viglCards');
    if(!mount){ warn('No #viglCards mount to render'); return; }
    mount.innerHTML='';
    if(!items.length){ mount.innerHTML='<div style="opacity:.7;padding:12px;border:1px dashed #2a3547;border-radius:10px">No discoveries yet.</div>'; return; }
    const frag=document.createDocumentFragment();
    items.forEach(i=>frag.appendChild(cardNode(i)));
    mount.appendChild(frag);
  }

  function safeRender(raw){
    const items = normalizeAndDedupe(Array.isArray(raw)?raw:[]);
    updateCounters(items);
    renderCards(items);
    return items;
  }

  // ---------- Legacy bridges ---------------------------------------------------
  if(typeof window.dedupeDiscoveries !== 'function'){
    window.dedupeDiscoveries = function(arr){
      try { return normalizeAndDedupe(Array.isArray(arr)?arr:[]); }
      catch(e){ err('dedupeDiscoveries failed', e); return Array.isArray(arr)?arr:[]; }
    };
    log('installed legacy bridge: dedupeDiscoveries');
  }
  if(typeof window.renderDiscoveries !== 'function'){
    window.renderDiscoveries = function(arr){
      try { return safeRender(arr); }
      catch(e){ err('renderDiscoveries failed', e); }
    };
    log('installed legacy bridge: renderDiscoveries');
  }

  // Public hook if you need to call it directly from legacy code
  window.VIGL_SAFE = Object.assign(window.VIGL_SAFE || {}, { normalize, normalizeAndDedupe, render: safeRender });

  // ---------- Convenience fetch for legacy global call -------------------------
  async function fetchDiscoveries(){
    const API_URL = (window.VIGL && window.VIGL.API_URL) || window.VIGL_API_URL || '/api/discoveries/dashboard';
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 12000);
    try{
      const res = await fetch(API_URL, {cache:'no-store', signal: ctrl.signal});
      const json = await res.json();
      const arr = Array.isArray(json) ? json : (json.data || json.results || json.items || json.discoveries || []);
      return arr;
    } finally { clearTimeout(t); }
  }

  // Global fallbacks expected by legacy inline code
  if(typeof window.loadViglDiscoveries !== 'function'){
    window.loadViglDiscoveries = async function(){
      try{
        const arr = await fetchDiscoveries();
        return window.renderDiscoveries ? window.renderDiscoveries(arr) : safeRender(arr);
      } catch(e){ err('loadViglDiscoveries failed', e); }
    };
    log('installed legacy bridge: loadViglDiscoveries');
  }

  if(typeof window.computeUpside !== 'function'){
    // Computes percentage upside from current to target. If upsidePct provided, returns it.
    window.computeUpside = function({current, target, upsidePct}={}){
      const c = Number(current); const t = Number(target);
      if(Number.isFinite(upsidePct)) return upsidePct;
      if(Number.isFinite(c) && Number.isFinite(t) && c>0){ return ((t - c) / c) * 100; }
      return 0;
    };
    log('installed helper: computeUpside');
  }

  // Create key placeholders ASAP (before DOMContentLoaded) to avoid early null refs
  (function primePlaceholders(){
    if(document.readyState === 'loading') {
      if(!document.getElementById('btnScanMarket')){
        const b = document.createElement('button');
        b.id='btnScanMarket'; b.type='button'; b.style.display='none';
        document.body.appendChild(b);
        log('primed placeholder #btnScanMarket early');
      }
      if(!document.getElementById('viglCards')){
        const s = document.createElement('section');
        s.id='viglCards'; s.style.minHeight='10px';
        document.body.appendChild(s);
        log('primed placeholder #viglCards early');
      }
    }
  })();

  log('shim loaded');
})();