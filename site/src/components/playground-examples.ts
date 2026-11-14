// Starting snippets for the playground. Each runs as-is against the real library.
export const EXAMPLES: Record<string, string> = {
  'Deadline: timeout vs cancel': `import { EnhancedAbortController, TimeSpan, isAbortError, isTimeoutError } from '@ylcnfrht/enhanced-abort-controller';

/** Stands in for fetch: resolves after ms, rejects with signal.reason on abort. */
function work(ms: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => resolve(\`done after \${ms} ms\`), ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

async function attempt(ms: number, cancelAfter?: number) {
  const controller = new EnhancedAbortController().abortAfter(TimeSpan.fromMilliseconds(300));
  if (cancelAfter !== undefined) setTimeout(() => controller.abort(), cancelAfter);
  try {
    console.log(await work(ms, controller.signal));
  } catch (error) {
    if (!isAbortError(error)) throw error;
    console.log(isTimeoutError(error) ? 'timed out' : 'cancelled', '·', error);
  } finally {
    controller.dispose(); // releases the timer; does not abort
  }
}

await attempt(100);
await attempt(1000);
await attempt(1000, 50);
`,
  'abortAfter resets (CancelAfter)': `import { EnhancedAbortController } from '@ylcnfrht/enhanced-abort-controller';

const t0 = Date.now();
const controller = new EnhancedAbortController().abortAfter(200);
controller.signal.register((reason) => console.log(\`aborted at ~\${Date.now() - t0} ms:\`, reason));

// Each call replaces the previous deadline: a heartbeat keeps it alive.
for (let i = 0; i < 3; i++) {
  await new Promise((r) => setTimeout(r, 150));
  controller.abortAfter(200);
  console.log(\`heartbeat at ~\${Date.now() - t0} ms, deadline moved\`);
}

console.log('reason:', await controller.signal.whenAborted);

// Infinity (or -1, TimeSpan.infinite) cancels a schedule.
const quiet = new EnhancedAbortController().abortAfter(50).abortAfter(Infinity);
await new Promise((r) => setTimeout(r, 100));
console.log('quiet aborted?', quiet.signal.aborted);
`,
  'Linked controllers': `import { EnhancedAbortController, isTimeoutError } from '@ylcnfrht/enhanced-abort-controller';

const request = new AbortController(); // e.g. aborted when the client disconnects

// A per-step deadline that also follows the request.
const step = EnhancedAbortController.createLinkedController(request.signal).abortAfter(100);
console.log('step reason:', await step.signal.whenAborted, '· timeout?', isTimeoutError(step.reason));
console.log('request still live?', !request.signal.aborted);

// The parent's reason is forwarded as is.
const child = EnhancedAbortController.createLinkedController(request.signal);
request.abort(new Error('client disconnected'));
console.log('child reason:', child.reason, '· same object?', child.reason === request.signal.reason);

// Optional signals: undefined and null are skipped.
const maybe: AbortSignal | undefined = undefined;
const linked = EnhancedAbortController.createLinkedController(maybe, AbortSignal.timeout(50));
console.log('linked:', await linked.signal.whenAborted);
`,
  'register & whenAborted': `import { register, whenAborted, EnhancedAbortSignal } from '@ylcnfrht/enhanced-abort-controller';

const controller = new AbortController();

const registration = register(controller.signal, (reason) => console.log('cleanup with', reason));
const dropped = register(controller.signal, () => console.log('never printed'));
dropped.unregister();
console.log('dropped.isDisposed:', dropped.isDisposed);

setTimeout(() => controller.abort('shutting down'), 50);
console.log('whenAborted ->', await whenAborted(controller.signal));
console.log('registration spent:', registration.isDisposed);

// Already aborted: the callback runs now, synchronously.
register(AbortSignal.abort('early'), (r) => console.log('ran at once with', r));

// none never aborts and holds no listeners.
console.log('none can abort?', EnhancedAbortSignal.canBeAborted(EnhancedAbortSignal.none));
console.log('register(none):', register(EnhancedAbortSignal.none, () => {}).isDisposed);
`,
  'dispose does not abort': `import { EnhancedAbortController } from '@ylcnfrht/enhanced-abort-controller';

const controller = new EnhancedAbortController().abortAfter(100);
controller.dispose();
await new Promise((r) => setTimeout(r, 200));
console.log('aborted after dispose?', controller.signal.aborted); // false: the timer was released

try {
  controller.abortAfter(10);
} catch (error) {
  console.log('abortAfter after dispose:', error);
}

controller.abort('still works');
console.log('reason:', controller.reason);
`,
  TimeSpan: `import { TimeSpan, EnhancedAbortSignal } from '@ylcnfrht/enhanced-abort-controller';

const span = TimeSpan.fromMinutes(1).add(TimeSpan.fromSeconds(30));
console.log(String(span), span.totalSeconds, span.totalMinutes);
console.log('compare:', span.compareTo(TimeSpan.fromMinutes(2)), span > TimeSpan.fromMinutes(1));
console.log('equals:', span.equals(TimeSpan.fromMilliseconds(90_000)));
console.log('infinite:', TimeSpan.infinite.milliseconds, '· zero:', TimeSpan.zero.milliseconds);

const signal = EnhancedAbortSignal.timeout(TimeSpan.fromMilliseconds(80));
console.log('timeout reason:', await EnhancedAbortSignal.whenAborted(signal));

try {
  TimeSpan.fromSeconds(NaN);
} catch (error) {
  console.log(error);
}
`,
};
