import { timeoutReason } from './AbortError.ts';
import type { AbortRegistration } from './AbortRegistration.ts';
import { none } from './none.ts';
import { register, whenAborted } from './register.ts';
import type { TimeSpan } from './TimeSpan.ts';

/** A delay: milliseconds or a {@link TimeSpan}. `Infinity` or -1 (`TimeSpan.infinite`) mean "never". */
export type Delay = number | TimeSpan;

/** The signal of an {@link EnhancedAbortController}: a real `AbortSignal`, with a few extras. */
export interface EnhancedSignal extends AbortSignal {
  /** Same as `register(signal, callback)`. */
  register(callback: (reason: unknown) => void): AbortRegistration;
  /** Same as `whenAborted(signal)`: resolves with the reason once the signal aborts. */
  readonly whenAborted: Promise<unknown>;
  /** Always true for a controller's signal (see `EnhancedAbortSignal.canBeAborted`). */
  readonly canBeAborted: boolean;
}

/** setTimeout's limit: longer delays overflow and fire immediately, so they are split. */
/** @internal */
export const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Milliseconds for a delay, `Infinity` for "never".
 * @throws RangeError for NaN, negatives other than -1, and non-numbers.
 * @internal
 */
export function toMilliseconds(delay: Delay): number {
  // Duck-typed, not instanceof: the ESM and CJS builds each have their own TimeSpan class.
  const ms = typeof delay === 'object' && delay !== null ? (delay as TimeSpan).milliseconds : delay;
  if (ms === Infinity || ms === -1) return Infinity;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    throw new RangeError(
      `Invalid delay: ${String(ms)}. Use a non-negative number of milliseconds or a TimeSpan; Infinity or -1 mean no timeout.`,
    );
  }
  return ms;
}

/** Starts an unref'd timer (it never keeps the process alive), chaining for delays past setTimeout's limit. */
function startTimer(ms: number, onFire: () => void): () => void {
  let handle: ReturnType<typeof setTimeout>;
  const arm = (remaining: number) => {
    handle =
      remaining > MAX_TIMER_MS ? setTimeout(() => arm(remaining - MAX_TIMER_MS), MAX_TIMER_MS) : setTimeout(onFire, remaining);
    (handle as { unref?: () => void }).unref?.();
  };
  arm(ms);
  return () => clearTimeout(handle);
}

/**
 * An `AbortController` with .NET `CancellationTokenSource` features. It *is* an `AbortController`,
 * and `controller.signal` is a real `AbortSignal`: pass it to fetch, `AbortSignal.any`, streams,
 * timers and any other API that takes a signal.
 *
 * @example
 * ```ts
 * const controller = new EnhancedAbortController().abortAfter(TimeSpan.fromSeconds(5));
 * const response = await fetch(url, { signal: controller.signal });
 * ```
 */
export class EnhancedAbortController extends AbortController implements Disposable {
  #cancelTimer: (() => void) | undefined;
  #links: AbortRegistration[] = [];
  #disposed = false;

  constructor() {
    super();
    const signal = super.signal;
    let aborted: Promise<unknown> | undefined;
    Object.defineProperties(signal, {
      register: { value: (callback: (reason: unknown) => void) => register(signal, callback), configurable: true },
      // One promise (and one listener) per signal, however often it is read.
      whenAborted: { get: () => (aborted ??= whenAborted(signal)), configurable: true },
      canBeAborted: { value: true, configurable: true },
    });
    // Once aborted, nothing more can happen: release the timer and the links to parent signals.
    // Guarded: a synthetic dispatchEvent(new Event('abort')) must not disarm a live controller.
    const onAbort = () => (signal.aborted ? this.#release() : undefined);
    signal.addEventListener('abort', onAbort);
  }

  /** The controller's signal: a real `AbortSignal`, always the same object. */
  override get signal(): EnhancedSignal {
    return super.signal as EnhancedSignal;
  }

  /** Same as `signal.aborted`. */
  get isAborted(): boolean {
    return super.signal.aborted;
  }

  /** Same as `signal.reason`: why it aborted, `undefined` until then. */
  get reason(): unknown {
    return super.signal.reason;
  }

  /** True after {@link dispose}. */
  get isDisposed(): boolean {
    return this.#disposed;
  }

  /**
   * Aborts after `delay`, like .NET's `CancelAfter`: calling it again **replaces** the previous schedule,
   * and `Infinity` / -1 / `TimeSpan.infinite` cancel it. The reason is a `DOMException` named
   * `TimeoutError`, as with `AbortSignal.timeout`. The timer never keeps the process alive, and delays
   * longer than 24.8 days work. Does nothing once aborted. Returns the controller, for chaining.
   *
   * @throws RangeError for NaN, negative (other than -1) or non-numeric delays.
   * @throws Error if the controller was disposed.
   */
  abortAfter(delay: Delay): this {
    const ms = toMilliseconds(delay);
    if (this.#disposed) throw new Error('Cannot schedule an abort on a disposed EnhancedAbortController.');
    if (this.isAborted) return this;
    this.#cancelTimer?.();
    this.#cancelTimer = ms === Infinity ? undefined : startTimer(ms, () => this.abort(timeoutReason()));
    return this;
  }

  /** Same as {@link abortAfter} with a `TimeSpan`. Kept for 1.x code. */
  abortAfterTimeSpan(timeSpan: TimeSpan): this {
    return this.abortAfter(timeSpan);
  }

  /**
   * Releases what the controller holds: the scheduled abort and the listeners it put on linked parent
   * signals. It does **not** abort (like .NET's `Dispose`); call `abort()` first if work should stop.
   * `abort()` still works afterwards. Safe to call more than once; supports `using`.
   */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#release();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  #release(): void {
    this.#cancelTimer?.();
    this.#cancelTimer = undefined;
    for (const link of this.#links.splice(0)) link.unregister();
  }

  /** A controller that aborts after `delay`, with a `TimeoutError` reason. */
  static timeout<C extends EnhancedAbortController>(this: new () => C, delay: Delay): C {
    return new this().abortAfter(delay);
  }

  /**
   * A controller that aborts as soon as any of `signals` aborts, with that signal's reason, like .NET's
   * `CreateLinkedTokenSource`. Aborting the linked controller does not affect the parents. Its listeners
   * on the parents are removed when it aborts or is disposed, so short-lived links on a long-lived parent
   * don't leak. `undefined`/`null` entries (optional signals) and `EnhancedAbortSignal.none` are skipped.
   */
  static createLinkedController<C extends EnhancedAbortController>(
    this: new () => C,
    ...signals: Array<AbortSignal | null | undefined>
  ): C {
    const controller = new this();
    for (const signal of signals) {
      if (!signal || signal === none) continue;
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      controller.#links.push(register(signal, (reason) => controller.abort(reason)));
    }
    return controller;
  }

  /** Same as {@link createLinkedController}. */
  static linkSignals<C extends EnhancedAbortController>(this: new () => C, ...signals: Array<AbortSignal | null | undefined>): C {
    return (this as unknown as typeof EnhancedAbortController).createLinkedController.call(this, ...signals) as C;
  }
}
