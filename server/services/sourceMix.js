// Simple in-memory ring buffer for source mix tracking
let sourceCounts = { screener: 0, sqlite: 0, empty: 0 };
let events = []; // {timestamp, source}

function recordSourceUsage(source) {
  const now = Date.now();
  events.push({ timestamp: now, source });
  
  // Prune events older than 1 hour
  const oneHourAgo = now - 60 * 60 * 1000;
  events = events.filter(e => e.timestamp >= oneHourAgo);
  
  // Recount
  sourceCounts = { screener: 0, sqlite: 0, empty: 0 };
  events.forEach(e => {
    if (sourceCounts[e.source] !== undefined) {
      sourceCounts[e.source]++;
    }
  });
}

function getSourceMixLastHour() {
  // Prune old events first
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  events = events.filter(e => e.timestamp >= oneHourAgo);
  
  // Recount
  const counts = { screener: 0, sqlite: 0, empty: 0 };
  events.forEach(e => {
    if (counts[e.source] !== undefined) {
      counts[e.source]++;
    }
  });
  
  const total = counts.screener + counts.sqlite + counts.empty;
  return {
    total,
    screener: counts.screener,
    sqlite: counts.sqlite,
    empty: counts.empty,
    window_hours: 1
  };
}

module.exports = {
  recordSourceUsage,
  getSourceMixLastHour
};