function currentSession(now = new Date()) {
  // Convert to US/Eastern (simple offset; exact DST not required for MVP)
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun
  const hh = et.getHours(), mm = et.getMinutes();
  const mins = hh * 60 + mm;
  const isWeekday = day >= 1 && day <= 5;
  // RTH 9:30–16:00 ET -> 570..960
  const rth = isWeekday && mins >= 570 && mins <= 960;
  return { session: rth ? 'RTH' : 'AH', et: et.toISOString() };
}

module.exports = { currentSession };