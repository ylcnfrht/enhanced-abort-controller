import { AbortRegistration } from './AbortRegistration.ts';
import { none } from './none.ts';

/** Shared by every `whenAborted(none)`: never settles and holds no listener. */
const never: Promise<unknown> = new Promise(() => {});

/**
 * Runs `callback` with the signal's reason when `signal` aborts, like .NET's `CancellationToken.Register`.
 * Works with any `AbortSignal` (from fetch, a framework, `AbortSignal.timeout`, ...).
 *
 * - If the signal has already aborted, the callback runs synchronously, now, and its exceptions
 *   propagate to the caller of `register()`.
 * - Otherwise it runs once, as an `abort` event listener: an exception it throws is reported like any
 *   event-listener exception (in Node, an uncaught exception), so handle errors inside the callback.
 * - Call `unregister()` (or `using`) on the result when the guarded work finishes.
 */
export function register(signal: AbortSignal, callback: (reason: unknown) => void): AbortRegistration {
  if (signal.aborted) {
    callback(signal.reason);
    return new AbortRegistration(undefined);
  }
  // `none` can never abort: nothing to listen to, nothing to leak.
  if (signal === none) return new AbortRegistration(undefined);
  const registration = new AbortRegistration(() => signal.removeEventListener('abort', listener));
  const listener = () => {
    registration.unregister(); // the callback runs once: the registration is spent
    callback(signal.reason);
  };
  signal.addEventListener('abort', listener, { once: true });
  return registration;
}

/**
 * A promise that resolves with the signal's reason once it aborts (immediately if it already has).
 * It never rejects. The listener is removed when the signal aborts.
 */
export function whenAborted(signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) return Promise.resolve(signal.reason);
  if (signal === none) return never;
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(signal.reason), { once: true }));
}
