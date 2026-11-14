// CommonJS works too.
const { EnhancedAbortController, TimeSpan, isTimeoutError } = require('@ylcnfrht/enhanced-abort-controller');
const { setTimeout: sleep } = require('node:timers/promises');

const controller = EnhancedAbortController.timeout(TimeSpan.fromMilliseconds(10));

// The pending work (a ref'd timer here, a request or a socket in real code) keeps the process alive;
// the abortAfter timer itself never does.
sleep(1000, undefined, { signal: controller.signal }).catch((error) => {
  console.log('aborted:', isTimeoutError(error) ? 'timed out' : error.name);
});
