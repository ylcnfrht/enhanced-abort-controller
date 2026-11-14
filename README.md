<div align="center">

# @ylcnfrht/enhanced-abort-controller

**Cancellation that cleans up after itself.**

An `AbortController` with .NET `CancellationTokenSource` powers: a resettable `abortAfter`, disposable `register()`,<br>
`whenAborted`, linked controllers that don't leak, and `TimeSpan`. The signal is a real `AbortSignal`, so fetch and every other API accept it.

[![npm](https://img.shields.io/npm/v/@ylcnfrht/enhanced-abort-controller?color=f59e0b&label=npm)](https://www.npmjs.com/package/@ylcnfrht/enhanced-abort-controller)
[![CI](https://github.com/ylcnfrht/enhanced-abort-controller/actions/workflows/ci.yml/badge.svg)](https://github.com/ylcnfrht/enhanced-abort-controller/actions/workflows/ci.yml)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-f59e0b)](package.json)
[![types](https://img.shields.io/npm/types/@ylcnfrht/enhanced-abort-controller?color=f59e0b)](https://www.npmjs.com/package/@ylcnfrht/enhanced-abort-controller)
[![license](https://img.shields.io/npm/l/@ylcnfrht/enhanced-abort-controller?color=f59e0b)](LICENSE)
[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/ylcnfrht)

[**Documentation**](https://enhanced-abort-controller.ferhatyalcin.dev) · [Quick start](https://enhanced-abort-controller.ferhatyalcin.dev/start/quick-start/) · [Playground](https://enhanced-abort-controller.ferhatyalcin.dev/playground/)

</div>

---

```sh
npm i @ylcnfrht/enhanced-abort-controller
```

```ts
import { EnhancedAbortController, TimeSpan, isAbortError, isTimeoutError } from '@ylcnfrht/enhanced-abort-controller';

using controller = new EnhancedAbortController().abortAfter(TimeSpan.fromSeconds(5));

try {
  const response = await fetch(url, { signal: controller.signal }); // a real AbortSignal
  return await response.json();
} catch (error) {
  if (!isAbortError(error)) throw error;
  console.log(isTimeoutError(error) ? 'timed out' : 'cancelled');
}
```

## Why

The platform already gives you `AbortSignal.timeout()` and `AbortSignal.any()`. This library adds what it doesn't, without replacing the signal:

- **A deadline you can move.** `abortAfter()` works like .NET's `CancelAfter`: call it again to reset the deadline, pass `Infinity` to cancel it. Delays longer than 24.8 days work, invalid ones throw instead of firing at once, and in Node and Bun the timer never keeps your process alive (like `AbortSignal.timeout`).
- **Linked controllers that clean up.** `createLinkedController(request.signal)` aborts with the parent's reason, and removes its listeners from every parent when it aborts or is disposed. Thousands of short-lived children on a long-lived signal leave nothing behind.
- **Callbacks with a handle.** `register(signal, cb)` returns a registration you can `unregister()` or scope with `using`; it runs at once if the signal already aborted. `whenAborted(signal)` is a promise of the reason.
- **Errors you can tell apart.** Timeouts abort with a `TimeoutError`, manual aborts with your reason. `isAbortError()` recognises fetch rejections, `DOMException`s and the library's `AbortError`; `isTimeoutError()` picks out timeouts.
- **`TimeSpan`.** `TimeSpan.fromMinutes(2)` instead of `120000`, with validation and arithmetic.
- **Small.** Zero dependencies, ESM and CommonJS, Node ≥ 20 and modern browsers. Browser-only TypeScript projects without `@types/node` need `"lib": ["esnext.disposable"]` (TypeScript ≥ 5.2) for the `using` types.

## A quick tour

```ts
import { EnhancedAbortController, EnhancedAbortSignal, TimeSpan, register, whenAborted } from '@ylcnfrht/enhanced-abort-controller';

// Deadlines: reset, cancel, or create one in a call.
const controller = new EnhancedAbortController().abortAfter(1000);
controller.abortAfter(TimeSpan.fromSeconds(5)); // replaces the previous deadline
controller.abortAfter(Infinity); //                  cancels it
const timeout = EnhancedAbortSignal.timeout(TimeSpan.fromSeconds(30));

// Per-step deadline inside a request: aborts on whichever comes first.
using step = EnhancedAbortController.createLinkedController(request.signal).abortAfter(2000);
await db.query(sql, { signal: step.signal });

// Cleanup on abort, for any AbortSignal.
using _closeOnAbort = register(request.signal, (reason) => socket.destroy(reason as Error));
const reason = await whenAborted(request.signal);

// The controller's own signal has the helpers built in.
controller.signal.register(() => console.log('aborted'));
await controller.signal.whenAborted;
```

`dispose()` (or `using`) releases the timer and the links to parent signals. Like .NET's `Dispose`, it does not abort: call `abort()` first if the work should stop.

## Upgrading from 1.x

2.0 is a redesign around the native `AbortSignal`. In 1.x, `controller.signal` was a wrapper that platform APIs rejected, so the documented `fetch(url, { signal: controller.signal.signal })` passed `undefined` and never cancelled. The [upgrade guide](https://enhanced-abort-controller.ferhatyalcin.dev/migration/v1-to-v2/) lists every change; the main ones:

| 1.x | 2.0 |
|---|---|
| `fetch(url, { signal: controller.signal.signal })` | `fetch(url, { signal: controller.signal })` |
| `signal.throwIfAborted('message')` | `signal.throwIfAborted()` (throws the reason) |
| `catch (e) { if (e instanceof AbortError) }` | `catch (e) { if (isAbortError(e)) }` |
| `dispose()` described as aborting | `dispose()` releases resources; call `abort()` to cancel |
| `register(() => …)` | `register((reason) => …)`, returns a disposable registration |
| timeout reason `AbortError` | `TimeoutError`, like `AbortSignal.timeout` |

## Documentation

Guides (fetch, Node APIs, Express request cancellation, testing with fake timers, a .NET mapping), interactive timeline and linked-signal simulators, a playground and the API reference: **[enhanced-abort-controller.ferhatyalcin.dev](https://enhanced-abort-controller.ferhatyalcin.dev)**. Runnable examples are in [`examples/`](examples).

## Contributing

```sh
npm install
npm test               # unit, regression and type tests + every example
npm run test:coverage  # with coverage thresholds
npm run test:dist      # build, then smoke-test the ESM and CJS output
npm run check:package  # publint + are-the-types-wrong
```

## Support

If this saves you time, you can [buy me a coffee](https://buymeacoffee.com/ylcnfrht).

## License

[MIT](LICENSE)
