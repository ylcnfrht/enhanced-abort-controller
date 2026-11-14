// Runs against the built package through its own exports map (ESM entry).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EnhancedAbortController, isTimeoutError, TimeSpan, whenAborted } from '@ylcnfrht/enhanced-abort-controller';

// Like AbortSignal.timeout, abortAfter's timer is unref'd: keep this script alive while it waits.
const keepAlive = setTimeout(() => {}, 10_000);
const c = new EnhancedAbortController().abortAfter(TimeSpan.fromMilliseconds(5));
assert.ok(c.signal instanceof AbortSignal);
assert.ok(isTimeoutError(await whenAborted(AbortSignal.any([c.signal]))));

// A pending abortAfter must not keep a process alive.
const started = Date.now();
execFileSync(process.execPath, ['--input-type=module', '-e', "import { EnhancedAbortController } from '@ylcnfrht/enhanced-abort-controller'; new EnhancedAbortController().abortAfter(5000);"], { cwd: new URL('../..', import.meta.url) });
assert.ok(Date.now() - started < 3000, 'process stayed alive');
clearTimeout(keepAlive);
console.log('esm ok');
