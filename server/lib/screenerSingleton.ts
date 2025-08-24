// server/lib/screenerSingleton.ts
import { runScreener, ScreenerResult } from "./runScreener";

let lock = false;
let lastResult: ScreenerResult | null = null;
let inflight: Promise<ScreenerResult> | null = null;

export async function runScreenerSingleton(opts: Parameters<typeof runScreener>[0]) {
  if (lock) {
    console.log(`[screenerSingleton] Already running, awaiting in-flight result for caller: ${opts.caller}`);
    // return the in-flight promise so callers don't spawn duplicates
    return inflight!;
  }
  
  console.log(`[screenerSingleton] Starting new screener run for caller: ${opts.caller}`);
  lock = true;
  inflight = runScreener(opts)
    .then(res => {
      lastResult = res;
      console.log(`[screenerSingleton] Completed for caller: ${opts.caller}, code: ${res.code}, duration: ${res.durationMs}ms`);
      return res;
    })
    .finally(() => { 
      lock = false; 
      inflight = null; 
    });
  return inflight;
}

export function getLastScreenerResult() { 
  return lastResult; 
}