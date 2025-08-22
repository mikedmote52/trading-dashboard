const { currentSession } = require('./marketHours');

function getProfile() {
  const { session } = currentSession();
  
  if (session === 'RTH') {
    // Regular trading hours: larger batch, longer timeout
    return {
      session,
      args: ['--limit', '120', '--json-out'],
      batchTarget: 1200,
      batchStrategy: 'rotate',
      timeoutMs: 15 * 60 * 1000  // 15 minutes
    };
  } else {
    // After hours: smaller batch, shorter timeout
    return {
      session,
      args: ['--limit', '80', '--json-out'],
      batchTarget: 800,
      batchStrategy: 'shuffle',
      timeoutMs: 12 * 60 * 1000  // 12 minutes
    };
  }
}

module.exports = { getProfile };