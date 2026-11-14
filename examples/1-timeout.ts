// Give an operation a deadline, and tell a timeout apart from a cancel.
import { EnhancedAbortController, TimeSpan, isAbortError, isTimeoutError } from '@ylcnfrht/enhanced-abort-controller';

/** Stands in for any signal-aware API (fetch, fs/promises, timers/promises, a database driver...). */
function slowJob(ms: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => resolve(`done after ${ms} ms`), ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

async function main() {
  using fast = new EnhancedAbortController().abortAfter(TimeSpan.fromMilliseconds(200));
  console.log(await slowJob(20, fast.signal));

  using slow = new EnhancedAbortController().abortAfter(50);
  try {
    await slowJob(1000, slow.signal);
  } catch (error) {
    if (!isAbortError(error)) throw error;
    console.log(isTimeoutError(error) ? 'timed out' : 'cancelled');
  }
}

await main();
