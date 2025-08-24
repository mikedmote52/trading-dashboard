/**
 * Runtime spawn guard - prevents direct screener calls bypassing singleton
 * Guards all child_process methods: spawn, exec, execFile
 */

const cp = require('child_process');

// Store original functions
const origSpawn = cp.spawn;
const origExec = cp.exec;
const origExecFile = cp.execFile;

function forbid(cmd, args) {
  const joined = [cmd, ...(args || [])].join(' ');
  return /universe_screener_v2\.py/.test(joined);
}

// Guard spawn
cp.spawn = function(command, args, options) {
  if (typeof command === 'string' && forbid(command, args)) {
    const error = new Error(`❌ Use runScreenerSingleton — direct spawn is forbidden: ${[command, ...(args || [])].join(' ')}`);
    console.error('[spawn-guard]', error.message);
    throw error;
  }
  return origSpawn.apply(this, arguments);
};

// Guard exec
cp.exec = function(command, options, callback) {
  if (typeof command === 'string' && forbid(command.split(/\s+/)[0], command.split(/\s+/).slice(1))) {
    const error = new Error(`❌ Use runScreenerSingleton — direct exec is forbidden: ${command}`);
    console.error('[spawn-guard]', error.message);
    throw error;
  }
  return origExec.apply(this, arguments);
};

// Guard execFile
cp.execFile = function(file, args, options, callback) {
  if (forbid(file, args)) {
    const error = new Error(`❌ Use runScreenerSingleton — direct execFile is forbidden: ${[file, ...(args || [])].join(' ')}`);
    console.error('[spawn-guard]', error.message);
    throw error;
  }
  return origExecFile.apply(this, arguments);
};

console.log('[spawn-guard] 🛡️ Comprehensive runtime screener guard active (spawn/exec/execFile)');

module.exports = {};