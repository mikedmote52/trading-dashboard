"use strict";
// ts-node friendly; compile with tsc if preferred
// Assumes env: BASE_URL (http://localhost:3000 or Render URL)
Object.defineProperty(exports, "__esModule", { value: true });
exports.v2 = exports.v1 = void 0;
exports.getScreenerSnapshot = getScreenerSnapshot;
exports.compareCriteria = compareCriteria;
exports.compareDataSources = compareDataSources;
exports.compareCandidateSets = compareCandidateSets;
exports.stepThroughV2 = stepThroughV2;
exports.saveJSON = saveJSON;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_fetch_1 = require("node-fetch");
// ---------- Config / Helpers ----------
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
function uniq(arr) {
    return Array.from(new Set(arr));
}
function safeRequire(modPath) {
    try {
        // Resolve relative to project root
        const full = node_path_1.default.resolve(modPath);
        return require(full);
    }
    catch {
        return null;
    }
}
async function httpJSON(url, init) {
    const res = await (0, node_fetch_1.default)(url, init);
    if (!res.ok)
        throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return (await res.json());
}
function makeAdapter(modPath, httpPath) {
    const mod = safeRequire(modPath);
    const hasInProc = !!mod?.run;
    return {
        name: node_path_1.default.basename(httpPath),
        async getCriteria() {
            if (mod?.getCriteria)
                return await Promise.resolve(mod.getCriteria());
            return await httpJSON(`${BASE_URL}${httpPath}/criteria`);
        },
        async getDataSources() {
            if (mod?.getDataSources)
                return await Promise.resolve(mod.getDataSources());
            return await httpJSON(`${BASE_URL}${httpPath}/datasources`);
        },
        async run(debug = false) {
            if (mod?.run)
                return await Promise.resolve(mod.run({ debug }));
            const q = debug ? "?debug=1" : "";
            const out = await httpJSON(`${BASE_URL}${httpPath}/scan${q}`);
            return out.tickers ?? out; // support alternate shape
        },
        async listFilters() {
            if (mod?.listFilters)
                return await Promise.resolve(mod.listFilters());
            // Fallback asks server; implement endpoint if missing
            try {
                return await httpJSON(`${BASE_URL}${httpPath}/filters`);
            }
            catch {
                return [];
            }
        },
        async stepwise(universe) {
            // Prefer in-proc stepper if available
            if (mod?.applyFiltersStepwise) {
                return await Promise.resolve(mod.applyFiltersStepwise(universe ?? []));
            }
            // HTTP fallback: expects server supports stepwise simulation
            const body = universe ? { universe } : {};
            try {
                return await httpJSON(`${BASE_URL}${httpPath}/stepwise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            }
            catch {
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
exports.v1 = makeAdapter("./server/routes/alphastack.js", "/api/alphastack");
exports.v2 = makeAdapter("./server/routes/v2/scan.js", "/api/v2/scan");
// ---------- Public Debug API ----------
async function getScreenerSnapshot(name) {
    const a = name === "v1" ? exports.v1 : exports.v2;
    const [criteria, dataSources, candidates] = await Promise.all([
        a.getCriteria(), a.getDataSources(), a.run(true),
    ]);
    return { name, criteria, dataSources, candidates: uniq(candidates).sort() };
}
function compareCriteria(a, b) {
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
function compareDataSources(a, b) {
    const toKey = (d) => `${d.name}@${d.version ?? "?"}`;
    const aSet = new Set(a.map(toKey));
    const bSet = new Set(b.map(toKey));
    const onlyA = a.filter(d => !bSet.has(toKey(d)));
    const onlyB = b.filter(d => !aSet.has(toKey(d)));
    return { onlyA, onlyB };
}
function compareCandidateSets(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    const onlyA = a.filter(t => !setB.has(t));
    const onlyB = b.filter(t => !setA.has(t));
    const both = a.filter(t => setB.has(t));
    return { onlyA, onlyB, both, countA: a.length, countB: b.length };
}
async function stepThroughV2(universe) {
    return await exports.v2.stepwise(universe);
}
// ---------- Persistence helpers ----------
function saveJSON(file, data) {
    const out = node_path_1.default.resolve(file);
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(out), { recursive: true });
    node_fs_1.default.writeFileSync(out, JSON.stringify(data, null, 2));
}
