const { runHeartbeat, allHealthy } = require('../health/heartbeat');

module.exports = async function requireHealthy(req,res,next){
  const snap = await runHeartbeat();
  if(!allHealthy(snap)){
    return res.status(503).json({
      success:false,
      error:'DATA_UNAVAILABLE',
      message:'One or more critical data feeds are unavailable or stale. Scan blocked.',
      snapshot:snap
    });
  }
  next();
};