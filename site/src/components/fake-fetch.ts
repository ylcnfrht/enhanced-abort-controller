/**
 * A fetch stand-in for the demos: resolves after `ms`, or rejects with `signal.reason` the moment the signal
 * aborts, which is exactly what the real fetch does. The signal comes from the real library.
 */
export function fakeFetch(ms: number, signal: AbortSignal): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve({ status: 200 });
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** A short label for any abort reason: `DOMException TimeoutError: …`, `Error: …`, `"text"`. */
export function describeReason(reason: unknown): string {
  if (reason instanceof DOMException) return `DOMException ${reason.name}: ${reason.message}`;
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  return reason === undefined ? 'undefined' : JSON.stringify(reason);
}
