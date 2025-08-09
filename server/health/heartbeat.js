// Use built-in fetch (Node 18+)
const fetch = globalThis.fetch;
const { db } = require('../db/sqlite');

const THRESHOLDS = {
  polygon: parseInt(process.env.FRESH_POLYGON_S ?? '90', 10),
  alpaca:  parseInt(process.env.FRESH_ALPACA_S  ?? '60', 10),
  borrow:  parseInt(process.env.FRESH_BORROW_S  ?? '86400', 10), // 24h
  db:      0
};

function ok(source){return {source,status:'OK',detail:'',freshness:THRESHOLDS[source]??0};}
function stale(source,detail){return {source,status:'STALE',detail,freshness:THRESHOLDS[source]??0};}
function down(source,detail){return {source,status:'DOWN',detail,freshness:THRESHOLDS[source]??0};}

async function checkPolygon(){
  try{
    const r = await fetch(`https://api.polygon.io/v1/marketstatus/now?apiKey=${process.env.POLYGON_API_KEY}`,{timeout:8000});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const serverTime = new Date(r.headers.get('date') || Date.now()).getTime();
    const age = (Date.now() - serverTime)/1000;
    return age <= THRESHOLDS.polygon ? ok('polygon') : stale('polygon',`age=${age.toFixed(1)}s`);
  }catch(e){return down('polygon',e.message);}
}

async function checkAlpaca(){
  try{
    const r = await fetch(`${process.env.ALPACA_BASE_URL}/clock`,{
      headers:{
        'APCA-API-KEY-ID':process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY':process.env.ALPACA_SECRET_KEY
      }, timeout:8000
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const js = await r.json();
    const ts = js?.timestamp || js?.next_open || new Date().toISOString();
    const age = (Date.now() - new Date(ts))/1000;
    return age <= THRESHOLDS.alpaca ? ok('alpaca') : stale('alpaca',`age=${age.toFixed(1)}s`);
  }catch(e){return down('alpaca',e.message);}
}

async function checkBorrowShort(){
  try{
    // For now, since we don't have a real borrow/short provider, we'll check if the env vars are set
    // This should be replaced with actual provider ping when implemented
    if (!process.env.BORROW_SHORT_PROVIDER || !process.env.BORROW_SHORT_API_KEY) {
      throw new Error('BORROW_SHORT_PROVIDER or BORROW_SHORT_API_KEY not configured');
    }
    
    // TODO: Replace with actual provider ping when borrow/short provider is implemented
    // const provider = require('../providers/borrowShort'); 
    // const { asOfIso } = await provider.ping();
    // const age = (Date.now() - new Date(asOfIso))/1000;
    // return age <= THRESHOLDS.borrow ? ok('borrow_short') : stale('borrow_short',`age=${age.toFixed(0)}s`);
    
    return down('borrow_short', 'Provider not implemented - will fail fast until configured');
  }catch(e){return down('borrow_short',e.message);}
}

function checkDb(){
  try{ db.prepare('PRAGMA user_version').get(); return ok('db'); }
  catch(e){ return down('db',e.message); }
}

async function runHeartbeat(){
  const checks = await Promise.all([checkPolygon(), checkAlpaca(), checkBorrowShort(), Promise.resolve(checkDb())]);
  const version = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local';
  
  // Add version to each check result
  const checksWithVersion = checks.map(check => ({
    ...check,
    version
  }));
  
  const stmt = db.prepare(`
    INSERT INTO data_status(source,status,detail,last_ok_iso,last_check_iso,freshness_s,version,updated_at)
    VALUES (@source,@status,@detail,CASE WHEN @status='OK' THEN datetime('now') ELSE (SELECT last_ok_iso FROM data_status WHERE source=@source) END,
            datetime('now'),@freshness,@version,datetime('now'))
    ON CONFLICT(source) DO UPDATE SET
      status=excluded.status,
      detail=excluded.detail,
      last_ok_iso=CASE WHEN excluded.status='OK' THEN excluded.last_ok_iso ELSE data_status.last_ok_iso END,
      last_check_iso=excluded.last_check_iso,
      freshness_s=excluded.freshness_s,
      version=excluded.version,
      updated_at=excluded.updated_at
  `);
  
  db.transaction(rows => rows.forEach(r => stmt.run(r)))(checksWithVersion);
  return checks;
}

function allHealthy(snapshot){ return snapshot.every(s => s.status === 'OK'); }

module.exports = { runHeartbeat, allHealthy };