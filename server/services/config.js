function getConfig() {
  return {
    engine: process.env.SELECT_ENGINE || 'v1',
    universeTarget: Number(process.env.UNIVERSE_TARGET || 200),
    refreshMs: Number(process.env.DISCOVERY_REFRESH_MS || 60000),
    breakerFails5m: Number(process.env.BREAKER_FAILS_5M || 5),
    screenerTimeoutMs: Number(process.env.SCREENER_TIMEOUT_MS || 90000),
    screenerBudgetMs: Number(process.env.SCREENER_BUDGET_MS || 30000)
  };
}

module.exports = { getConfig };