"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScreenerConfig = getScreenerConfig;
function getScreenerConfig() {
    const timeoutMs = clampNum(process.env.SCREENER_TIMEOUT_MS, 120000, 5000, 300000);
    const budgetMs = clampNum(process.env.SCREENER_BUDGET_MS, 45000, 5000, 180000);
    const limit = clampNum(process.env.SCREENER_LIMIT, 60, 5, 200);
    // Only use supported arguments from universe_screener_v2.py --help
    const defaults = [
        '--json-out',  // Supported: output JSON for API consumption
        '--limit', String(limit),  // Supported: number of candidates to return
        '--budget-ms', String(budgetMs)  // Supported: time budget in milliseconds
    ];
    const extraRaw = (process.env.SCREENER_EXTRA_ARGS || '').trim();
    const extraArgs = splitArgs(extraRaw);
    return { timeoutMs, budgetMs, limit, extraArgs: [...defaults, ...extraArgs] };
}
function clampNum(v, def, min, max) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
}
function splitArgs(s) {
    var _a, _b;
    if (!s)
        return [];
    // naive split on space; keep simple flags only
    return (_b = (_a = s.match(/--[a-zA-Z0-9\-]+(?:\s+\S+)?/g)) === null || _a === void 0 ? void 0 : _a.flatMap(tok => tok.split(/\s+/))) !== null && _b !== void 0 ? _b : s.split(/\s+/);
}
