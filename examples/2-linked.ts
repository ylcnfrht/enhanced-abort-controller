// A request-wide signal plus a per-step deadline, cleaned up when the step is done.
import { EnhancedAbortController, isTimeoutError } from '@ylcnfrht/enhanced-abort-controller';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

async function main() {
  const request = new AbortController(); // e.g. aborted when the client disconnects

  for (const [step, ms] of [['load user', 10], ['render', 200]] as const) {
    // Aborts when the request aborts (with its reason) or after 100 ms, whichever comes first.
    using stepController = EnhancedAbortController.createLinkedController(request.signal).abortAfter(100);
    try {
      await sleep(ms, stepController.signal);
      console.log(`${step}: ok`);
    } catch (error) {
      console.log(`${step}: ${isTimeoutError(error) ? 'timed out' : 'request cancelled'}`);
    }
    // Leaving the block disposes the step controller: its listener on request.signal is removed.
  }

  request.abort(new Error('client disconnected'));
  const late = EnhancedAbortController.createLinkedController(request.signal);
  console.log('after disconnect:', (late.reason as Error).message);
}

await main();
