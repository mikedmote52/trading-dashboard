const b = (v,d=false)=>v===undefined?d:/^(1|true|yes|on)$/i.test(String(v||'')); 
module.exports = {
  WORKERS_ENABLED: b(process.env.DIRECT_WORKER_ENABLED),
  USE_POSTGRES:   b(process.env.USE_POSTGRES),
  DISABLE_V2:     b(process.env.DISABLE_V2, !b(process.env.DIRECT_WORKER_ENABLED)),
  DISABLE_ALPHASTACK_BG: b(process.env.DISABLE_ALPHASTACK_BG, !b(process.env.DIRECT_WORKER_ENABLED)),
};