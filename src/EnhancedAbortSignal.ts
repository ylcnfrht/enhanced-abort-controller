import type { AbortRegistration } from './AbortRegistration.ts';
import { EnhancedAbortController, MAX_TIMER_MS, toMilliseconds, type Delay } from './EnhancedAbortController.ts';
import { none } from './none.ts';
import { register, whenAborted } from './register.ts';

/**
 * Helpers for any `AbortSignal`, including ones you didn't create (fetch, frameworks, `AbortSignal.timeout`).
 * Every function returns or accepts real `AbortSignal`s.
 */
export const EnhancedAbortSignal = {
  /** A signal that never aborts, always the same object. Use as a default for optional signals. */
  none,

  /** A new, already-aborted signal (reason: an `AbortError` `DOMException`). */
  get aborted(): AbortSignal {
    return AbortSignal.abort();
  },

  /**
   * `AbortSignal.timeout` that also accepts a `TimeSpan`, `Infinity` (returns `none`) and delays over 24.8 days.
   * Aborts with a `TimeoutError`; never keeps the process alive.
   */
  timeout(delay: Delay): AbortSignal {
    const ms = toMilliseconds(delay);
    if (ms === Infinity) return none;
    return ms <= MAX_TIMER_MS ? AbortSignal.timeout(ms) : EnhancedAbortController.timeout(ms).signal;
  },

  /**
   * `AbortSignal.any`, skipping `undefined`/`null` (optional signals) and `none`. The native implementation
   * releases its links when the result is garbage-collected, so per-request use on a long-lived signal doesn't leak.
   */
  any(signals: Iterable<AbortSignal | null | undefined>): AbortSignal {
    const live = [...signals].filter((s): s is AbortSignal => !!s && s !== none);
    return live.length === 0 ? none : AbortSignal.any(live);
  },

  /** See `register()`. */
  register(signal: AbortSignal, callback: (reason: unknown) => void): AbortRegistration {
    return register(signal, callback);
  },

  /** See `whenAborted()`. */
  whenAborted(signal: AbortSignal): Promise<unknown> {
    return whenAborted(signal);
  },

  /** False only for `EnhancedAbortSignal.none`: whether the signal can ever abort. .NET's `CanBeCanceled`. */
  canBeAborted(signal: AbortSignal): boolean {
    return signal !== none;
  },
};
