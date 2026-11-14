/**
 * An error for aborted work, for code that wants to throw its own. Platform APIs (fetch, timers,
 * `signal.throwIfAborted()`) reject with the signal's reason instead, usually a `DOMException`
 * named `AbortError` or `TimeoutError`; use {@link isAbortError} to recognise all of them.
 */
export class AbortError extends Error {
  override name = 'AbortError';

  constructor(message = 'The operation was aborted.', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/**
 * True for every way an aborted operation fails: this library's {@link AbortError}, and any error
 * named `AbortError` or `TimeoutError` (the `DOMException`s that fetch, `AbortSignal.timeout`,
 * `abortAfter` and `throwIfAborted` produce).
 *
 * @example
 * ```ts
 * try {
 *   await fetch(url, { signal: controller.signal });
 * } catch (error) {
 *   if (isAbortError(error)) return; // cancelled or timed out
 *   throw error;
 * }
 * ```
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof AbortError) return true;
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * True if `error` is a timeout: a `TimeoutError` from `abortAfter`, `timeout()` or `AbortSignal.timeout`,
 * also when wrapped: Node core APIs (fs/promises, timers/promises, streams, events.once) reject with an
 * `AbortError` whose `cause` is the signal's reason.
 */
export function isTimeoutError(error: unknown): boolean {
  for (let current = error, depth = 0; typeof current === 'object' && current !== null && depth < 5; depth++) {
    if ((current as { name?: unknown }).name === 'TimeoutError') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** The reason used when a scheduled abort fires, matching `AbortSignal.timeout`. @internal */
export function timeoutReason(): DOMException {
  return new DOMException('The operation timed out.', 'TimeoutError');
}
