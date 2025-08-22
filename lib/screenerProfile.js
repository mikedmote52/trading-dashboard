const { currentSession } = require('./marketHours');

function getProfile() {
  const { session } = currentSession();
  const base = ['--json', '--quiet-logs', '--feature-backend', 'sqlite', '--no-parquet'];
  const rth = [...base, '--limit', '100', '--budget-ms', '120000'];
  const ah = [...base, '--limit', '80', '--budget-ms', '120000', '--prefer-prevday', '--disable-intraday-volume'];
  return { session, args: session === 'RTH' ? rth : ah };
}

module.exports = { getProfile };