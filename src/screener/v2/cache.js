// Simple in-memory cache with TTL + stale-while-revalidate
const state = {
  tickers: null,  // Can store full candidates or just tickers
  updatedAt: 0,
  error: null,
};

const TTL_MS = Number(process.env.V2_CACHE_TTL_MS || 180_000); // 3 minute TTL cache for full universe scans

function isFresh() {
  return state.tickers && (Date.now() - state.updatedAt) < TTL_MS;
}

module.exports = {
  getSnapshot() {
    return { ...state, fresh: isFresh() };
  },
  setSnapshot(tickers) {
    state.tickers = Array.isArray(tickers) ? tickers : null;
    state.updatedAt = Date.now();
    state.error = null;
  },
  setError(err) {
    state.error = (err && err.message) ? err.message : String(err);
  },
  isFresh,
};