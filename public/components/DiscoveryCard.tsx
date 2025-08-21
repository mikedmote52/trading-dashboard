import React, { useMemo, useState, useId } from "react";

/** Tailwind helpers (inline, no external UI kit) */
const badgeTier = (score: number) =>
  score >= 95 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-emerald-500/20 shadow-lg"
  : score >= 90 ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
  : "bg-slate-500/20 text-slate-300 border border-slate-500/30";

function useToast() {
  return (msg: string, type: "success"|"error"|"info"="info") => {
    const div = document.createElement("div");
    div.className = "fixed z-50 top-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white";
    div.style.background = type==="success" ? "#10b981" : type==="error" ? "#ef4444" : "#6366f1";
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(()=>div.remove(), 3500);
  };
}

export type DiscoveryItem = {
  ticker: string; 
  symbol?: string;
  price: number; 
  score: number;
  action: "BUY"|"EARLY_READY"|"WATCHLIST";
  rel_vol_30m?: number; 
  rel_vol_day?: number; 
  indicators?: {
    atr_pct?: number;
    relvol?: number;
  };
  dynamic_target_price?: number; 
  target_kind?: string;
  targets?: {
    tp1?: string;
    tp2?: string;
  };
  thesis?: string;
  thesis_text?: string;
  thesis_tldr?: string;
  run_id: string; 
  snapshot_ts?: string;
};

export default function DiscoveryCard({ item }:{item:DiscoveryItem}) {
  const ticker = item.ticker || item.symbol || '';
  const rel = item.rel_vol_30m ?? item.rel_vol_day ?? item.indicators?.relvol ?? null;
  const atr_pct = item.indicators?.atr_pct;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const modalId = useId();

  // Generate thesis text if not provided
  const thesisText = useMemo(() => {
    if (item.thesis_text) return item.thesis_text;
    if (item.thesis_tldr) return item.thesis_tldr;
    if (item.thesis) return item.thesis;
    
    let text = `${ticker} at $${item.price.toFixed(2)}`;
    if (atr_pct) text += `, ATR ${atr_pct.toFixed(1)}%`;
    if (rel && rel > 1.5) text += `, ${rel.toFixed(1)}× volume`;
    return text;
  }, [item, ticker, atr_pct, rel]);

  return (
    <div className="rounded-2xl bg-slate-900/70 ring-1 ring-white/10 shadow-xl p-4 flex flex-col gap-3 hover:ring-emerald-500/30 hover:shadow-emerald-500/10 hover:shadow-lg transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xl font-semibold text-white">{ticker}</div>
          <div className="text-slate-300">${item.price.toFixed(2)}</div>
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-bold ${badgeTier(item.score)}`}>
          VIGL {Math.round(item.score)}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        {rel !== null && rel !== undefined && (
          <div>
            <div className="text-slate-400">RelVol</div>
            <div className="text-slate-200">{rel.toFixed(1)}×</div>
          </div>
        )}
        {typeof atr_pct === "number" && (
          <div>
            <div className="text-slate-400">ATR%</div>
            <div className="text-slate-200">{atr_pct.toFixed(1)}%</div>
          </div>
        )}
        {item.dynamic_target_price && (
          <div>
            <div className="text-slate-400">Target</div>
            <div className="text-slate-200">
              ${item.dynamic_target_price.toFixed(2)}
              {item.target_kind ? <span className="text-xs text-slate-400"> ({item.target_kind})</span> : ""}
            </div>
          </div>
        )}
      </div>

      {/* Thesis */}
      <div className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
        {thesisText}
      </div>

      {/* Action */}
      {item.action === "BUY" && (
        <button
          onClick={()=>setOpen(true)}
          className="mt-1 w-full rounded-xl bg-emerald-600 text-white font-semibold py-3 hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all duration-200 transform hover:scale-[1.02]"
          aria-haspopup="dialog" aria-controls={modalId}
        >
          Buy
        </button>
      )}

      {/* Order Modal */}
      {open && (
        <OrderModal
          id={modalId}
          item={item}
          onClose={()=>setOpen(false)}
          onSuccess={(posId)=>toast(`Order placed: ${ticker} (${posId})`, "success")}
          onError={(m)=>toast(m, "error")}
        />
      )}
    </div>
  );
}

function OrderModal({
  id, item, onClose, onSuccess, onError
}:{ id:string; item:DiscoveryItem; onClose:()=>void; onSuccess:(posId:string)=>void; onError:(m:string)=>void }) {
  const [usd, setUsd] = useState(100);
  const [auto, setAuto] = useState(true);
  const [tp1, setTp1] = useState(20);
  const [tp2, setTp2] = useState(50);
  const [sl,  setSl ] = useState(10);
  const [busy, setBusy] = useState(false);
  const ticker = item.ticker || item.symbol || '';

  const valid = usd>=10 && usd<=500 && Number.isFinite(usd);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const body = {
        ticker: ticker,
        usd,
        tp1_pct: (auto?20:tp1)/100,
        tp2_pct: (auto?50:tp2)/100,
        sl_pct:  (auto?10:sl)/100,
        engine: "python_v2",
        run_id: item.run_id,
        snapshot_ts: item.snapshot_ts || item.run_id.split("-")[0],
        price: item.price  // Fallback reference price
      };
      const res = await fetch("/api/order", {
        method:"POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Order failed");
      onSuccess(json.position_id || json.order_id || "ok");
      
      // Optional: navigate to portfolio
      if (json.portfolio_link) {
        setTimeout(() => {
          window.location.href = json.portfolio_link;
        }, 1500);
      }
      
      onClose();
    } catch (e:any) {
      onError(e.message || "Order failed");
    } finally {
      setBusy(false);
    }
  }

  // Keyboard handling
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" id={id}
      className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 ring-1 ring-white/10 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-white text-lg font-semibold">Buy {ticker}</div>
            <div className="text-slate-400 text-sm">Default $100 · TP1 20% · TP2 50% · SL 10%</div>
          </div>
          <button onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800"
            aria-label="Close">
            ✕
          </button>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="block text-slate-300 text-sm font-medium">Amount (USD)</label>
          <div className="flex items-center gap-2">
            <button onClick={()=>setUsd(v=>Math.max(10, v-25))}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors">−25</button>
            <input type="number" value={usd}
              onChange={e=>setUsd(Number(e.target.value)||0)}
              className="flex-1 text-center px-3 py-2 rounded-lg bg-slate-800 text-white outline-none ring-1 ring-white/10 focus:ring-emerald-500/50 transition-all" />
            <button onClick={()=>setUsd(v=>Math.min(500, v+25))}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors">+25</button>
          </div>
          <div className="text-slate-400 text-xs">Range $10–$500</div>
        </div>

        {/* Auto TP/SL */}
        <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} 
            className="rounded border-slate-600 bg-slate-800 text-emerald-600 focus:ring-emerald-500/50" />
          Auto TP/SL (TP1 20%, TP2 50%, SL 10%)
        </label>

        {!auto && (
          <div className="grid grid-cols-3 gap-2">
            <NumberBox label="TP1 %" value={tp1} setValue={setTp1} />
            <NumberBox label="TP2 %" value={tp2} setValue={setTp2} />
            <NumberBox label="SL %"  value={sl}  setValue={setSl} />
          </div>
        )}

        <button disabled={!valid || busy}
          onClick={submit}
          className={`w-full rounded-xl py-3 font-semibold transition-all duration-200 ${(!valid||busy) ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500 text-white transform hover:scale-[1.02]"}`}>
          {busy ? "Placing Order..." : "Confirm Buy"}
        </button>
      </div>
    </div>
  );
}

function NumberBox({label,value,setValue}:{label:string;value:number;setValue:(n:number)=>void}) {
  return (
    <label className="text-slate-300 text-xs">
      {label}
      <input type="number" value={value} min={1}
        onChange={e=>setValue(Number(e.target.value)||0)}
        className="mt-1 w-full rounded-lg bg-slate-800 px-2 py-1 text-center text-white ring-1 ring-white/10 focus:ring-emerald-500/50 transition-all" />
    </label>
  );
}