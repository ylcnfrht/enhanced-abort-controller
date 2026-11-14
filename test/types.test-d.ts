import {
  AbortRegistration,
  EnhancedAbortController,
  EnhancedAbortSignal,
  TimeSpan,
  register,
  whenAborted,
  type EnhancedSignal,
} from '../src/index.ts';

test('the signal is an AbortSignal everywhere one is expected', () => {
  const c = new EnhancedAbortController();
  expectTypeOf(c.signal).toEqualTypeOf<EnhancedSignal>();
  expectTypeOf(c.signal).toMatchTypeOf<AbortSignal>();
  expectTypeOf(c).toMatchTypeOf<AbortController>();
  // Accepted by platform APIs without casts.
  void fetch('https://example.com', { signal: c.signal });
  AbortSignal.any([c.signal, EnhancedAbortSignal.timeout(TimeSpan.fromSeconds(1))]);
});

test('helpers accept any AbortSignal', () => {
  const native = new AbortController().signal;
  expectTypeOf(register(native, (reason) => expectTypeOf(reason).toBeUnknown())).toEqualTypeOf<AbortRegistration>();
  expectTypeOf(whenAborted(native)).toEqualTypeOf<Promise<unknown>>();
  expectTypeOf(EnhancedAbortController.createLinkedController(native, EnhancedAbortSignal.none)).toEqualTypeOf<EnhancedAbortController>();
});

test('delays are numbers or TimeSpans and abortAfter chains', () => {
  const c = new EnhancedAbortController().abortAfter(100).abortAfter(TimeSpan.fromMinutes(1));
  expectTypeOf(c).toEqualTypeOf<EnhancedAbortController>();
  // @ts-expect-error strings are not delays
  c.abortAfter('10s');
});

test('controllers and registrations are disposable', () => {
  expectTypeOf(new EnhancedAbortController()).toMatchTypeOf<Disposable>();
  expectTypeOf(register(new AbortController().signal, () => {})).toMatchTypeOf<Disposable>();
});
