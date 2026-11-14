/**
 * A callback registered on a signal with `register()`. Unregister it when the work it guards is
 * done, so long-lived signals don't collect listeners. Supports `using`.
 *
 * @example
 * ```ts
 * using registration = register(signal, () => socket.destroy());
 * await doWork(); // the callback is removed when this block exits
 * ```
 */
export class AbortRegistration implements Disposable {
  #unregister: (() => void) | undefined;

  /** @internal Created by `register()`. */
  constructor(unregister: (() => void) | undefined) {
    this.#unregister = unregister;
  }

  /** True once unregistered, once the callback has run, or if the signal had already aborted when it was registered. */
  get isDisposed(): boolean {
    return this.#unregister === undefined;
  }

  /** Removes the callback. Safe to call more than once. */
  unregister(): void {
    const unregister = this.#unregister;
    this.#unregister = undefined;
    unregister?.();
  }

  /** Same as {@link unregister}. */
  dispose(): void {
    this.unregister();
  }

  [Symbol.dispose](): void {
    this.unregister();
  }
}
