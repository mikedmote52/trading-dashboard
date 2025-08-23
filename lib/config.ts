export type ScreenerConfig = {
  timeoutMs: number; budgetMs: number; limit: number; extraArgs: string[];
};
export function getScreenerConfig(): ScreenerConfig {
  const clamp = (v:string|undefined, def:number, min:number, max:number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
  };
  const timeoutMs = clamp(process.env.SCREENER_TIMEOUT_MS, 120000, 5000, 300000);
  const budgetMs  = clamp(process.env.SCREENER_BUDGET_MS,   45000, 5000, 180000);
  const limit     = clamp(process.env.SCREENER_LIMIT,           60,    5,   200);

  const defaults = [
    '--limit', String(limit)
  ];
  const extraRaw = (process.env.SCREENER_EXTRA_ARGS || '').trim();
  const extra = extraRaw ? extraRaw.split(/\s+/) : [];
  return { timeoutMs, budgetMs, limit, extraArgs: [...defaults, ...extra] };
}