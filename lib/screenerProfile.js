const { currentSession } = require('./marketHours');

function getProfile() {
  const { session } = currentSession();
  const base = ['--json', '--quiet-logs', '--feature-backend', 'sqlite', '--no-parquet'];
  
  if (session === 'RTH') {
    // Regular trading hours: larger batch, rotate strategy, longer timeout
    return {
      session,
      args: [...base, '--limit', '120', '--budget-ms', '150000'],
      batchTarget: 1200,
      batchStrategy: 'rotate',
      timeoutMs: 15 * 60 * 1000  // 15 minutes
    };
  } else {
    // After hours: smaller batch, shuffle strategy, shorter timeout
    return {
      session,
      args: [...base, '--limit', '80', '--budget-ms', '90000', '--prefer-prevday', '--disable-intraday-volume'],
      batchTarget: 800,
      batchStrategy: 'shuffle',
      timeoutMs: 12 * 60 * 1000  // 12 minutes
    };
  }
}

module.exports = { getProfile };