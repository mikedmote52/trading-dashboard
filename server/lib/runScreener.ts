// server/lib/runScreener.ts
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

export type ScreenerResult = {
  runId: string;
  jsonOut: string;
  durationMs: number;
  stdout: string;
  stderr: string;
  code: number;
};

export async function runScreener({
  limit = 10,
  budgetMs = 12000,
  jsonOut = process.env.DISCOVERY_JSON_PATH || "/var/data/discovery_screener.json",
  caller = "unknown",
}: {
  limit?: number;
  budgetMs?: number;
  jsonOut?: string;
  caller?: string;
}): Promise<ScreenerResult> {
  const runId = `scr_${Date.now()}_${randomUUID().slice(0,8)}`;
  const t0 = Date.now();
  const script = path.resolve("agents/universe_screener_v2.py");
  const args = [
    script,
    `--limit=${limit}`,
    `--budget-ms=${budgetMs}`,
    `--json-out=${jsonOut}`,
  ];
  const env = { ...process.env, JSON_OUT: jsonOut, SCREENER_CALLER: caller, SCREENER_RUN_ID: runId };

  const py = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"], env });
  let stdout = "", stderr = "";
  py.stdout.on("data", d => { const s = d.toString(); stdout += s; process.stdout.write(`[screener:${caller}:${runId}] ${s}`); });
  py.stderr.on("data", d => { const s = d.toString(); stderr += s; process.stderr.write(`[screener-err:${caller}:${runId}] ${s}`); });

  const code: number = await new Promise(resolve => py.on("close", resolve as any));
  const durationMs = Date.now() - t0;

  return { runId, jsonOut: path.resolve(jsonOut), durationMs, stdout, stderr, code };
}