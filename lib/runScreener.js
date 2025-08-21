"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScreener = runScreener;
exports.runScreenerLegacy = runScreenerLegacy;
// lib/runScreener.ts
const node_child_process_1 = require("node:child_process");
const config_1 = require("./config");
const BIN = process.env.SCREENER_BIN || 'python3';
async function runScreener(extra = [], timeoutOverride) {
    const { timeoutMs, extraArgs } = (0, config_1.getScreenerConfig)();
    const TIMEOUT = timeoutOverride !== null && timeoutOverride !== void 0 ? timeoutOverride : timeoutMs;
    // Use the actual screener path
    const screenerPath = 'agents/universe_screener.py';
    const args = dedupeArgs([screenerPath, '--json-out', ...extraArgs, ...extra]);
    let out = '', err = '';
    let timedOut = false;
    return new Promise((resolve, reject) => {
        const p = (0, node_child_process_1.spawn)(BIN, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        const to = setTimeout(() => { timedOut = true; try {
            p.kill('SIGTERM');
        }
        catch (_a) { } }, TIMEOUT);
        p.stdout.setEncoding('utf8');
        p.stderr.setEncoding('utf8');
        p.stdout.on('data', d => { out += d; });
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);
        p.on('close', () => {
            var _a;
            clearTimeout(to);
            try {
                const parsed = (_a = parseRobust(out)) !== null && _a !== void 0 ? _a : salvageJson(out);
                if (!parsed)
                    throw new Error('no JSON found');
                if (timedOut)
                    console.warn('[runScreener] timeout but salvaged valid JSON');
                return resolve(parsed);
            }
            catch (e) {
                const head = (out || '').slice(0, 200).replace(/\s+/g, ' ');
                return reject(new Error(`parse error: ${e.message}; stdout_head=${head}`));
            }
        });
    });
}
function parseRobust(buf) {
    var _a;
    const s = (buf || '').trim();
    if (!s)
        return null;
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        try {
            return JSON.parse(s);
        }
        catch ( /* fallthrough */_b) { /* fallthrough */ }
    }
    // NDJSON / noisy lines
    const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const arr = [];
    for (const line of lines) {
        const o = extractLastJson(line);
        if (o)
            arr.push(o);
    }
    if (arr.length)
        return arr;
    const last = extractLastJson(s);
    if (last)
        return Array.isArray(last) ? last : { items: (_a = last.items) !== null && _a !== void 0 ? _a : [] };
    return null;
}
function extractLastJson(s) {
    const open = s.lastIndexOf('{');
    const close = s.lastIndexOf('}');
    if (open >= 0 && close > open) {
        const piece = s.slice(open, close + 1);
        try {
            return JSON.parse(piece);
        }
        catch (_a) {
            return null;
        }
    }
    return null;
}
// NEW: salvage last complete {...} by brace depth in the FULL stdout
function salvageJson(buf) {
    const s = (buf || '').trim();
    if (!s)
        return null;
    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '{') {
            if (depth === 0)
                start = i;
            depth++;
        }
        else if (c === '}') {
            depth--;
            if (depth === 0)
                end = i;
        }
    }
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(s.slice(start, end + 1));
        }
        catch (_a) {
            return null;
        }
    }
    return null;
}
function dedupeArgs(a) {
    // last flag wins for simple "--flag value" pairs
    const out = [];
    const seen = new Map();
    for (let i = 0; i < a.length; i++) {
        const tok = a[i];
        if (!tok.startsWith('--')) {
            out.push(tok);
            continue;
        }
        const key = tok;
        let val;
        if (i + 1 < a.length && !a[i + 1].startsWith('--')) {
            val = a[i + 1];
            i++;
        }
        seen.set(key, out.length);
        out.push(key);
        if (val)
            out.push(val);
    }
    return out;
}
// Legacy function wrapper for compatibility
function runScreenerLegacy(args = [], timeoutMs = 90000) {
    return runScreener(args, timeoutMs).then(result => {
        if (Array.isArray(result)) {
            return { items: result };
        }
        else if (result && result.items) {
            return { items: result.items };
        }
        else {
            return { items: [] };
        }
    }).catch(error => {
        return { items: [], error: error.message };
    });
}
