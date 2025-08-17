// ts-node friendly; compile with tsc if preferred
// Assumes env: BASE_URL (http://localhost:3000 or Render URL)

import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";

type Ticker = string;

export type Criteria = Record<string, unknown>;
export type DataSource = { name: string; version?: string; lastSync?: string; notes?: string };
export type DataSources = DataSource[];
export type FilterReport = {
  filterName: string;
  beforeCount: number;
  afterCount: number;
  dropped: Ticker[];
  kept: Ticker[];
};

export type ScreenerSnapshot = {
  name: string; // "v1" | "v2"
  criteria: Criteria;
  dataSources: DataSources;
  candidates: Ticker[];
};

// ---------- Config / Helpers ----------
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function safeRequire<T = any>(modPath: string): T | null {
  try {
    // Resolve relative to project root
    const full = path.resolve(modPath);
    return require(full) as T;
  } catch {
    return null;
  }
}

async function httpJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

// ---------- Adapters (in-process if present) ----------
type InProcAPI = {
  getCriteria?: () => Promise<Criteria> | Criteria;
  getDataSources?: () => Promise<DataSources> | DataSources;
  run?: (opts?: { debug?: boolean }) => Promise<Ticker[]> | Ticker[];
  listFilters?: () => Promise<string[]> | string[];
  applyFiltersStepwise?: (universe: Ticker[]) => Promise<FilterReport[]> | FilterReport[];
};

function makeAdapter(modPath: string, httpPath: string) {
  const mod = safeRequire<InProcAPI>(modPath);
  const hasInProc = !!mod?.run;

  return {
    name: path.basename(httpPath),
    async getCriteria(): Promise<Criteria> {
      if (mod?.getCriteria) return await Promise.resolve(mod.getCriteria());
      return await httpJSON<Criteria>(`${BASE_URL}${httpPath}/criteria`);
    },
    async getDataSources(): Promise<DataSources> {
      if (mod?.getDataSources) return await Promise.resolve(mod.getDataSources());
      return await httpJSON<DataSources>(`${BASE_URL}${httpPath}/datasources`);
    },
    async run(debug = false): Promise<Ticker[]> {
      if (mod?.run) return await Promise.resolve(mod.run({ debug })) as Ticker[];
      const q = debug ? "?debug=1" : "";
      const out = await httpJSON<{ tickers: Ticker[] }>(`${BASE_URL}${httpPath}/scan${q}`);
      return out.tickers ?? out as unknown as Ticker[]; // support alternate shape
    },
    async listFilters(): Promise<string[]> {
      if (mod?.listFilters) return await Promise.resolve(mod.listFilters());
      // Fallback asks server; implement endpoint if missing
      try {
        return await httpJSON<string[]>(`${BASE_URL}${httpPath}/filters`);
      } catch {
        return [];
      }
    },
    async stepwise(universe?: Ticker[]): Promise<FilterReport[]> {
      // Prefer in-proc stepper if available
      if (mod?.applyFiltersStepwise) {
        return await Promise.resolve(mod.applyFiltersStepwise(universe ?? []));
      }
      // HTTP fallback: expects server supports stepwise simulation
      const body = universe ? { universe } : {};
      try {
        return await httpJSON<FilterReport[]>(
          `${BASE_URL}${httpPath}/stepwise`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        );
      } catch {
        // Last-ditch: emulate by running once and returning a single report
        const final = await this.run(true);
        return [{
          filterName: "ALL_FILTERS (fallback)",
          beforeCount: final.length,
          afterCount: final.length,
          dropped: [],
          kept: final
        }];
      }
    },
    hasInProc
  };
}

// Common defaults — adjust to your repo layout if needed
export const v1 = makeAdapter("./server/routes/alphastack.js", "/api/alphastack");
export const v2 = makeAdapter("./server/routes/v2/scan.js", "/api/v2/scan");

// ---------- Public Debug API ----------
export async function getScreenerSnapshot(name: "v1" | "v2"): Promise<ScreenerSnapshot> {
  const a = name === "v1" ? v1 : v2;
  const [criteria, dataSources, candidates] = await Promise.all([
    a.getCriteria(), a.getDataSources(), a.run(true),
  ]);
  return { name, criteria, dataSources, candidates: uniq(candidates).sort() };
}

export function compareCriteria(a: Criteria, b: Criteria) {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  const missingInA = bKeys.filter(k => !(k in a));
  const missingInB = aKeys.filter(k => !(k in b));
  const diffs = aKeys
    .filter(k => k in b)
    .map(k => ({ key: k, a: a[k], b: b[k], equal: JSON.stringify(a[k]) === JSON.stringify(b[k]) }))
    .filter(x => !x.equal);
  return { missingInA, missingInB, diffs };
}

export function compareDataSources(a: DataSources, b: DataSources) {
  const toKey = (d: DataSource) => `${d.name}@${d.version ?? "?"}`;
  const aSet = new Set(a.map(toKey));
  const bSet = new Set(b.map(toKey));
  const onlyA = a.filter(d => !bSet.has(toKey(d)));
  const onlyB = b.filter(d => !aSet.has(toKey(d)));
  return { onlyA, onlyB };
}

export function compareCandidateSets(a: Ticker[], b: Ticker[]) {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyA = a.filter(t => !setB.has(t));
  const onlyB = b.filter(t => !setA.has(t));
  const both = a.filter(t => setB.has(t));
  return { onlyA, onlyB, both, countA: a.length, countB: b.length };
}

export async function stepThroughV2(universe?: Ticker[]): Promise<FilterReport[]> {
  return await v2.stepwise(universe);
}

// ---------- Persistence helpers ----------
export function saveJSON(file: string, data: unknown) {
  const out = path.resolve(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
}