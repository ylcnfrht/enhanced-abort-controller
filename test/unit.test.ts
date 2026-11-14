import {
  AbortError,
  AbortRegistration,
  EnhancedAbortController,
  EnhancedAbortSignal,
  TimeSpan,
  isAbortError,
  isTimeoutError,
  register,
  whenAborted,
} from '../src/index.ts';

describe('TimeSpan', () => {
  it('converts between units', () => {
    const span = TimeSpan.fromHours(1.5);
    expect(span.milliseconds).toBe(5_400_000);
    expect(span.totalSeconds).toBe(5400);
    expect(span.totalMinutes).toBe(90);
    expect(span.totalHours).toBe(1.5);
    expect(TimeSpan.fromDays(2).totalDays).toBe(2);
    expect(TimeSpan.fromMinutes(1).milliseconds).toBe(60_000);
    expect(TimeSpan.fromSeconds(2).milliseconds).toBe(2000);
    expect(TimeSpan.fromMilliseconds(5).milliseconds).toBe(5);
  });

  it('adds, subtracts, compares and prints', () => {
    const a = TimeSpan.fromSeconds(90);
    const b = TimeSpan.fromMinutes(1);
    expect(a.add(b).totalSeconds).toBe(150);
    expect(a.subtract(b).totalSeconds).toBe(30);
    expect(a.compareTo(b)).toBe(1);
    expect(b.compareTo(a)).toBe(-1);
    expect(a.compareTo(TimeSpan.fromMilliseconds(90_000))).toBe(0);
    expect(a.equals(TimeSpan.fromMilliseconds(90_000))).toBe(true);
    expect(+a).toBe(90_000);
    expect(a > b).toBe(true);
    expect(String(b)).toBe('60000ms');
  });

  it('has fixed boundary values and rejects non-finite input in every factory', () => {
    expect(TimeSpan.zero.milliseconds).toBe(0);
    expect(TimeSpan.maxValue.milliseconds).toBe(Number.MAX_SAFE_INTEGER);
    expect(TimeSpan.minValue.milliseconds).toBe(-Number.MAX_SAFE_INTEGER);
    expect(TimeSpan.infinite.milliseconds).toBe(-1);
    for (const make of [TimeSpan.fromSeconds, TimeSpan.fromMinutes, TimeSpan.fromHours, TimeSpan.fromDays, TimeSpan.fromMilliseconds]) {
      expect(() => make(Infinity)).toThrow(RangeError);
    }
  });
});

describe('EnhancedAbortController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('abortAfter replaces the previous schedule (CancelAfter) and returns the controller', () => {
    const c = new EnhancedAbortController();
    expect(c.abortAfter(100)).toBe(c);
    vi.advanceTimersByTime(80);
    c.abortAfter(100); // reset: now 100 ms from here
    vi.advanceTimersByTime(80);
    expect(c.isAborted).toBe(false);
    vi.advanceTimersByTime(20);
    expect(c.isAborted).toBe(true);
    expect(isTimeoutError(c.reason)).toBe(true);
  });

  it('abortAfter(Infinity) cancels a schedule; abortAfter(0) aborts on the next turn', () => {
    const c = new EnhancedAbortController().abortAfter(50).abortAfter(Infinity);
    vi.advanceTimersByTime(1000);
    expect(c.isAborted).toBe(false);
    const z = new EnhancedAbortController().abortAfter(0);
    expect(z.isAborted).toBe(false);
    vi.advanceTimersByTime(0);
    expect(z.isAborted).toBe(true);
  });

  it('abortAfterTimeSpan and static timeout accept TimeSpans', () => {
    const a = new EnhancedAbortController().abortAfterTimeSpan(TimeSpan.fromSeconds(1));
    const b = EnhancedAbortController.timeout(TimeSpan.fromSeconds(2));
    vi.advanceTimersByTime(1000);
    expect([a.isAborted, b.isAborted]).toEqual([true, false]);
    vi.advanceTimersByTime(1000);
    expect(b.isAborted).toBe(true);
  });

  it('a manual abort wins over a pending timeout and keeps its own reason', () => {
    const c = new EnhancedAbortController().abortAfter(100);
    c.abort('manual');
    vi.advanceTimersByTime(200);
    expect(c.reason).toBe('manual');
  });

  it('supports using', () => {
    let leaked: EnhancedAbortController;
    {
      using c = new EnhancedAbortController().abortAfter(100);
      leaked = c;
    }
    expect(leaked.isDisposed).toBe(true);
    vi.advanceTimersByTime(200);
    expect(leaked.isAborted).toBe(false);
  });

  it('linking to an already-aborted parent aborts at once with its reason; linkSignals is an alias', () => {
    const live = new AbortController();
    const linked = EnhancedAbortController.linkSignals(live.signal, AbortSignal.abort('early'));
    expect(linked.reason).toBe('early');
    expect(EnhancedAbortController.linkSignals().isAborted).toBe(false);
  });

  it('aborting a linked controller leaves its parents alone', () => {
    const parent = new AbortController();
    const child = EnhancedAbortController.createLinkedController(parent.signal);
    child.abort();
    expect(parent.signal.aborted).toBe(false);
  });

  it('a linked controller can also time out on its own', () => {
    const parent = new AbortController();
    const child = EnhancedAbortController.createLinkedController(parent.signal).abortAfter(10);
    vi.advanceTimersByTime(10);
    expect(isTimeoutError(child.reason)).toBe(true);
    expect(parent.signal.aborted).toBe(false);
  });
});

describe('register and whenAborted', () => {
  it('register runs once per abort, can be unregistered, and reports disposal', () => {
    const c = new AbortController();
    let calls = 0;
    const kept = register(c.signal, () => calls++);
    const dropped = register(c.signal, () => calls++);
    expect(kept).toBeInstanceOf(AbortRegistration);
    dropped.unregister();
    dropped.dispose(); // idempotent
    expect(dropped.isDisposed).toBe(true);
    expect(kept.isDisposed).toBe(false);
    c.abort();
    c.abort();
    expect(calls).toBe(1);
  });

  it('a registration made after the abort is already disposed', () => {
    let reason: unknown;
    const r = register(AbortSignal.abort('x'), (why) => (reason = why));
    expect(reason).toBe('x');
    expect(r.isDisposed).toBe(true);
  });

  it('whenAborted resolves with the reason, also for signals aborted earlier', async () => {
    await expect(whenAborted(AbortSignal.abort('before'))).resolves.toBe('before');
    const c = new AbortController();
    const p = EnhancedAbortSignal.whenAborted(c.signal);
    queueMicrotask(() => c.abort('after'));
    await expect(p).resolves.toBe('after');
  });

  it('EnhancedAbortSignal.register delegates to register', () => {
    const c = new AbortController();
    const seen: unknown[] = [];
    EnhancedAbortSignal.register(c.signal, (r) => seen.push(r));
    c.abort('ok');
    expect(seen).toEqual(['ok']);
  });

  it('EnhancedAbortSignal.timeout aborts with a TimeoutError', async () => {
    const signal = EnhancedAbortSignal.timeout(5);
    expect(isTimeoutError(await whenAborted(signal))).toBe(true);
  });
});

describe('errors', () => {
  it('AbortError has a name, default message and cause', () => {
    const cause = new Error('root');
    const e = new AbortError(undefined, { cause });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AbortError');
    expect(e.message).toBe('The operation was aborted.');
    expect(e.cause).toBe(cause);
  });

  it('isAbortError and isTimeoutError recognise library and platform errors', () => {
    expect(isAbortError(new AbortError())).toBe(true);
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbortError(new DOMException('x', 'TimeoutError'))).toBe(true);
    expect(isAbortError(AbortSignal.abort().reason)).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isTimeoutError(new DOMException('x', 'TimeoutError'))).toBe(true);
    expect(isTimeoutError(new AbortError())).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });

  it('isTimeoutError sees through Node core AbortErrors whose cause is the timeout', async () => {
    const { setTimeout: sleep } = await import('node:timers/promises');
    const error = await sleep(1000, undefined, { signal: EnhancedAbortSignal.timeout(5) }).catch((e) => e);
    expect(error.name).toBe('AbortError');
    expect(isTimeoutError(error)).toBe(true);
    expect(isAbortError(error)).toBe(true);
    const cancelled = await sleep(1000, undefined, { signal: AbortSignal.abort() }).catch((e) => e);
    expect(isTimeoutError(cancelled)).toBe(false);
  });
});
