# Changelog

## 2.0.0 (2026-11-15)

A redesign around the native `AbortSignal`. Upgrade guide: https://enhanced-abort-controller.ferhatyalcin.dev/migration/v1-to-v2/

### Fixed (defects in 1.x, each with a regression test)

- `controller.signal` was a wrapper class, not an `AbortSignal`: fetch, `AbortSignal.any` and `addEventListener` rejected it, and the documented `controller.signal.signal` was `undefined`, so fetch requests were never cancelled.
- `whenAborted` never resolved unless the abort happened in the same synchronous tick.
- `abortAfter` fired immediately for `Infinity`, `NaN`, negative values and delays over 24.8 days.
- Linked controllers and `any()` dropped the parent's abort reason; timeouts were indistinguishable from manual aborts.
- Timers kept the process alive and were not cleared on abort; `EnhancedAbortSignal.timeout` never cleared its timer.
- Linked controllers left their listeners on parent signals forever, even after `dispose()`.
- `dispose()` was documented as aborting but didn't, and silently disabled `abort()` afterwards.
- `register()` callbacks received no reason; `none`/`aborted` returned a new object on every access.
- Tests were compiled into the published package.

### Changed

- `EnhancedAbortController` extends `AbortController`; `signal` is the native `AbortSignal` with `register()`, `whenAborted` and `canBeAborted` added.
- `abortAfter()` replaces a previous schedule (like .NET `CancelAfter`), accepts a `TimeSpan`, cancels on `Infinity`/-1, validates its input, returns the controller, and aborts with a `TimeoutError` `DOMException`.
- `dispose()` releases the timer and parent links without aborting; `abort()` still works afterwards.
- `throwIfAborted()` is the native one (throws the reason); the custom-message overload is gone.
- `EnhancedAbortSignal` is a helper object for any `AbortSignal`: `none`, `aborted`, `timeout()`, `any()`, `register()`, `whenAborted()`, `canBeAborted()`.
- ESM + CommonJS builds with an `exports` map; Node.js ≥ 20.

### Added

- Standalone `register(signal, cb)` and `whenAborted(signal)` for any `AbortSignal`; `AbortRegistration` supports `using`.
- `isAbortError()` and `isTimeoutError()`.
- `TimeSpan`: input validation, `add`, `subtract`, `equals`, `compareTo`, `valueOf`, `toString`, `TimeSpan.infinite`.
- `using` support on controllers; `AbortError` accepts `{ cause }`.

## 1.1.0

Published as `@nodelibraries/enhanced-abort-controller` (now deprecated).
