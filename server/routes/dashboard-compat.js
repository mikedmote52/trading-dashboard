const express = require("express");
const fetch = require("node-fetch");
const { deriveAlphaThesis } = require("../lib/thesis");
const router = express.Router();

async function jget(url, timeout=15000){ 
  const r = await fetch(url,{timeout}); 
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); 
  return r.json(); 
}

router.get("/dashboard", async (req,res)=>{
  try{
    const base = `${req.protocol}://${req.get("host")}`;
    const sq = await jget(`${base}/api/v2/scan/squeeze?engine=optimized`);
    let items = Array.isArray(sq.results) ? sq.results : Array.isArray(sq.items) ? sq.items : [];
    
    items = items.map(x => {
      if (!x.thesis || !x.reasons) { 
        const d = deriveAlphaThesis(x); 
        x = {...x, ...d}; 
      }
      return x;
    });
    
    let portfolio = [];
    try { 
      const pi = await jget(`${base}/api/portfolio-intelligence/analyze`, 10000); 
      portfolio = pi.positions || []; 
    } catch(_) {}
    
    res.set("x-compat","dashboard");
    res.json({ 
      ok:true, 
      engine:"optimized", 
      items, 
      discoveries:items, 
      portfolio, 
      meta:{
        count:items.length, 
        generatedAt:Date.now(), 
        source:"compat(v2/squeeze)"
      } 
    });
  }catch(e){ 
    res.status(502).json({
      ok:false,
      error:"dashboard-compat-failed",
      message:e.message
    }); 
  }
});

module.exports = router;