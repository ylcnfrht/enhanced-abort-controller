// Runs against the built package through its own exports map (CJS entry).
const assert = require('node:assert/strict');
const { EnhancedAbortController, register } = require('@ylcnfrht/enhanced-abort-controller');

const parent = new AbortController();
const child = EnhancedAbortController.createLinkedController(parent.signal);
let reason;
register(child.signal, (r) => (reason = r));
parent.abort('stop');
assert.equal(reason, 'stop');
console.log('cjs ok');
