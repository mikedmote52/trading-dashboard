let windowEvents = []; // timestamps of failures
let tripped = false;
let consecutiveSuccess = 0;

function noteSuccess() {
  consecutiveSuccess++;
  if (consecutiveSuccess >= 2) {
    tripped = false;
  }
  prune();
}

function noteFailure() {
  windowEvents.push(Date.now());
  consecutiveSuccess = 0;
  prune();
  const failures5m = windowEvents.length;
  const { breakerFails5m } = require('./config').getConfig();
  if (failures5m >= breakerFails5m) {
    tripped = true;
  }
}

function isTripped() {
  prune();
  return tripped;
}

function getState() {
  prune();
  return {
    tripped,
    consecutiveSuccess,
    failures5m: windowEvents.length
  };
}

function prune() {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
  windowEvents = windowEvents.filter(t => t >= cutoff);
}

module.exports = {
  noteSuccess,
  noteFailure,
  isTripped,
  getState
};