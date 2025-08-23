/**
 * Async Job Runner - Prevents timeout/header race conditions
 * POST creates job, GET polls status - no long-running HTTP requests
 */

const jobs = new Map(); // jobId -> { status, result, error, startTime }

/**
 * Start async job and return job ID immediately
 */
function startJob(jobType, params = {}) {
  const jobId = `${jobType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  jobs.set(jobId, {
    status: 'running',
    result: null,
    error: null,
    startTime: Date.now(),
    type: jobType,
    params
  });

  // Run job async without blocking response
  runJobAsync(jobId, jobType, params);
  
  return jobId;
}

/**
 * Get job status and result
 */
function getJobStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return { status: 'not_found', error: 'Job not found' };
  }
  
  return {
    status: job.status,
    result: job.result,
    error: job.error,
    duration: Date.now() - job.startTime,
    type: job.type
  };
}

/**
 * Clean up old jobs (prevent memory leak)
 */
function cleanupJobs(maxAgeMs = 5 * 60 * 1000) { // 5 minutes
  const cutoff = Date.now() - maxAgeMs;
  for (const [jobId, job] of jobs.entries()) {
    if (job.startTime < cutoff) {
      jobs.delete(jobId);
    }
  }
}

/**
 * Execute job asynchronously
 */
async function runJobAsync(jobId, jobType, params) {
  const job = jobs.get(jobId);
  if (!job) return;
  
  try {
    let result;
    
    switch (jobType) {
      case 'discovery_direct':
        result = await runDirectDiscovery(params);
        break;
      case 'discovery_alphastack':
        result = await runAlphaStackDiscovery(params);
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
    
    job.status = 'completed';
    job.result = result;
    
  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error.message);
    job.status = 'failed';
    job.error = error.message;
  }
}

/**
 * Run direct discovery (Python screener)
 */
async function runDirectDiscovery(params) {
  const { ingestDirect } = require("./screener_direct_ingest");
  const limit = Number(params.limit || 10);
  const budgetMs = Number(params.budgetMs || 12000);
  
  console.log(`🚀 Async direct discovery: limit=${limit}, budget=${budgetMs}ms`);
  return await ingestDirect(limit, budgetMs);
}

/**
 * Run AlphaStack discovery (legacy route)
 */
async function runAlphaStackDiscovery(params) {
  const { runScreener } = require("../../lib/runScreener");
  const limit = Number(params.limit || 5);
  const budgetMs = Number(params.budgetMs || 8000);
  
  console.log(`🚀 Async AlphaStack discovery: limit=${limit}, budget=${budgetMs}ms`);
  const result = await runScreener(['--limit', String(limit), '--budget-ms', String(budgetMs)]);
  const raw = result.json || result;
  
  return {
    ok: true,
    duration: result.duration || 0,
    status: raw.status || "ok",
    count: raw.count || 0,
    items: raw.items || []
  };
}

// Cleanup old jobs every 2 minutes
setInterval(cleanupJobs, 2 * 60 * 1000);

module.exports = {
  startJob,
  getJobStatus,
  cleanupJobs
};