// One test per defect an independent review found in 1.1.0 (each reproduced against 1.1.0 first).
import { getEventListeners } from 'node:events';
import { createServer, type Server } from 'node:http';
import {
  EnhancedAbortController,
  EnhancedAbortSignal,
  TimeSpan,
  isAbortError,
  isTimeoutError,
  register,
} from '../src/index.ts';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

let server: Server;
let url: string;
beforeAll(async () => {
  // Accepts requests and never answers: only an abort can end them.
  server = createServer(() => {});
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('1. the signal is a real AbortSignal', () => {
  it('passes instanceof, works with AbortSignal.any and addEventListener, keeps its identity', () => {
    const c = new EnhancedAbortController();
    expect(c).toBeInstanceOf(AbortController);
    expect(c.signal).toBeInstanceOf(AbortSignal);
    expect(c.signal).toBe(c.signal);
    const any = AbortSignal.any([c.signal]);
    let heard = 0;
    c.signal.addEventListener('abort', () => heard++);
    c.abort('why');
    expect(any.aborted).toBe(true);
    expect(any.reason).toBe('why');
    expect(heard).toBe(1);
  });

  it('cancels an in-flight fetch', async () => {
    const c = new EnhancedAbortController();
    const request = fetch(url, { signal: c.signal });
    await tick(20);
    c.abort();
    const error = await request.catch((e) => e);
    expect(error.name).toBe('AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('a scheduled abort times out a fetch with a TimeoutError', async () => {
    const error = await fetch(url, { signal: EnhancedAbortSignal.timeout(30) }).catch((e) => e);
    expect(isTimeoutError(error)).toBe(true);
  });
});

describe('2. whenAborted resolves whenever the abort happens', () => {
  it('after a later timer', async () => {
    const c = new EnhancedAbortController().abortAfter(5);
    await expect(c.signal.whenAborted).resolves.toMatchObject({ name: 'TimeoutError' });
  });

  it('after a later manual abort, with the reason', async () => {
    const c = new EnhancedAbortController();
    const waiting = c.signal.whenAborted;
    await tick();
    c.abort('stop');
    await expect(waiting).resolves.toBe('stop');
  });
});

describe('3. timers handle every delay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delays beyond setTimeout limits do not fire early', () => {
    const c = new EnhancedAbortController().abortAfter(TimeSpan.fromDays(30));
    vi.advanceTimersByTime(TimeSpan.fromDays(29).milliseconds);
    expect(c.isAborted).toBe(false);
    vi.advanceTimersByTime(TimeSpan.fromDays(1).milliseconds);
    expect(c.isAborted).toBe(true);
  });

  it('Infinity, -1, TimeSpan.infinite and TimeSpan.maxValue never fire', () => {
    const cs = [Infinity, -1, TimeSpan.infinite].map((d) => new EnhancedAbortController().abortAfter(d));
    const max = new EnhancedAbortController().abortAfter(TimeSpan.maxValue);
    vi.advanceTimersByTime(TimeSpan.fromDays(365).milliseconds);
    expect([...cs, max].some((c) => c.isAborted)).toBe(false);
  });

  it('invalid delays throw instead of aborting', () => {
    const c = new EnhancedAbortController();
    for (const bad of [NaN, -5, -Infinity, '10' as unknown as number]) expect(() => c.abortAfter(bad)).toThrow(RangeError);
    expect(c.isAborted).toBe(false);
    expect(() => new TimeSpan(NaN)).toThrow(RangeError);
  });
});

describe('4. reasons are kept', () => {
  it('linked controllers and any() forward the parent reason', () => {
    const parent = new AbortController();
    const linked = EnhancedAbortController.createLinkedController(parent.signal);
    const any = EnhancedAbortSignal.any([parent.signal]);
    const cause = new Error('user cancelled');
    parent.abort(cause);
    expect(linked.reason).toBe(cause);
    expect(any.reason).toBe(cause);
  });

  it('throwIfAborted throws the reason; timeouts are distinguishable from cancels', () => {
    const c = new EnhancedAbortController();
    c.abort(new Error('mine'));
    expect(() => c.signal.throwIfAborted()).toThrow('mine');
    const t = new EnhancedAbortController();
    t.abort();
    expect(isTimeoutError(t.reason)).toBe(false);
    expect(isAbortError(t.reason)).toBe(true);
  });

  it('register callbacks receive the reason', () => {
    const c = new EnhancedAbortController();
    const seen: unknown[] = [];
    c.signal.register((r) => seen.push(r));
    c.abort('r1');
    register(c.signal, (r) => seen.push(r));
    expect(seen).toEqual(['r1', 'r1']);
  });
});

describe('5. timers never keep the process alive and are released', () => {
  // Runs the TypeScript source directly, so it needs a Node with type stripping (22.18+); test:dist covers the build on every version.
  it.skipIf(!(process.features as { typescript?: unknown }).typescript)('a script with a pending abortAfter exits at once', async () => {
    const { execFileSync } = await import('node:child_process');
    const started = Date.now();
    execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      `const { EnhancedAbortController, EnhancedAbortSignal } = await import(${JSON.stringify(new URL('../src/index.ts', import.meta.url).href)});
       new EnhancedAbortController().abortAfter(5000); EnhancedAbortSignal.timeout(5000);`,
    ]);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('abort, dispose and rescheduling clear the previous timer', () => {
    vi.useFakeTimers();
    try {
      const c = new EnhancedAbortController().abortAfter(1000);
      expect(vi.getTimerCount()).toBe(1);
      c.abortAfter(2000);
      expect(vi.getTimerCount()).toBe(1);
      c.abort();
      expect(vi.getTimerCount()).toBe(0);
      c.abortAfter(1000); // already aborted: no new timer
      expect(vi.getTimerCount()).toBe(0);
      const d = new EnhancedAbortController().abortAfter(1000);
      d.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('6. linked controllers do not leak listeners', () => {
  it('disposing or aborting a child removes its listener from every parent', () => {
    const parent = new AbortController();
    const other = new AbortController();
    for (let i = 0; i < 1000; i++) {
      const child = EnhancedAbortController.createLinkedController(parent.signal, other.signal);
      if (i % 2) child.dispose();
      else child.abort();
    }
    expect(getEventListeners(parent.signal, 'abort')).toHaveLength(0);
    expect(getEventListeners(other.signal, 'abort')).toHaveLength(0);
  });

  it('when one parent aborts, the listener on the other parent is removed too', () => {
    const a = new AbortController();
    const b = new AbortController();
    EnhancedAbortController.createLinkedController(a.signal, b.signal);
    a.abort();
    expect(getEventListeners(b.signal, 'abort')).toHaveLength(0);
  });

  it('a registration can be unregistered, also with using', () => {
    const parent = new AbortController();
    {
      using _r = register(parent.signal, () => {});
      expect(getEventListeners(parent.signal, 'abort')).toHaveLength(1);
    }
    expect(getEventListeners(parent.signal, 'abort')).toHaveLength(0);
  });
});

describe('7. dispose semantics are explicit', () => {
  it('dispose releases without aborting; abort still works afterwards', () => {
    const c = new EnhancedAbortController();
    c.dispose();
    expect(c.isDisposed).toBe(true);
    expect(c.isAborted).toBe(false);
    c.abort('late');
    expect(c.signal.aborted).toBe(true);
    expect(c.reason).toBe('late');
    expect(() => c.abortAfter(10)).toThrow('disposed');
    c.dispose(); // idempotent
  });
});

describe('8. callback errors', () => {
  it('a callback registered on an aborted signal runs now and its error reaches the caller', () => {
    const c = new EnhancedAbortController();
    c.abort();
    expect(() =>
      register(c.signal, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });
});

describe('9. statics are stable values', () => {
  it('none is one never-aborting signal; aborted is aborted', () => {
    expect(EnhancedAbortSignal.none).toBe(EnhancedAbortSignal.none);
    expect(EnhancedAbortSignal.none.aborted).toBe(false);
    expect(EnhancedAbortSignal.canBeAborted(EnhancedAbortSignal.none)).toBe(false);
    expect(EnhancedAbortSignal.canBeAborted(new AbortController().signal)).toBe(true);
    expect(new EnhancedAbortController().signal.canBeAborted).toBe(true);
    expect(EnhancedAbortSignal.aborted.aborted).toBe(true);
    expect(TimeSpan.zero).toBe(TimeSpan.zero);
  });
});

// Second review, of the 2.0 rewrite itself.
describe('2.0 review findings', () => {
  const listeners = (s: AbortSignal) => getEventListeners(s, 'abort').length;

  it('R1 EnhancedAbortSignal.any is the native one: no listeners pile up on a long-lived parent', () => {
    const parent = new AbortController();
    for (let i = 0; i < 100; i++) EnhancedAbortSignal.any([parent.signal, new AbortController().signal]);
    expect(listeners(parent.signal)).toBe(0);
    expect(EnhancedAbortSignal.any([undefined, null, EnhancedAbortSignal.none])).toBe(EnhancedAbortSignal.none);
  });

  it('R2 none never collects listeners', async () => {
    const none = EnhancedAbortSignal.none;
    for (let i = 0; i < 100; i++) {
      void EnhancedAbortSignal.whenAborted(none);
      register(none, () => {});
      EnhancedAbortController.createLinkedController(none, new AbortController().signal);
    }
    expect(listeners(none)).toBe(0);
    expect(register(none, () => {}).isDisposed).toBe(true);
    expect(EnhancedAbortSignal.timeout(Infinity)).toBe(none);
  });

  it('R3 signal.whenAborted is one promise with one listener', () => {
    const c = new EnhancedAbortController();
    const base = listeners(c.signal);
    for (let i = 0; i < 50; i++) void c.signal.whenAborted;
    expect(listeners(c.signal)).toBe(base + 1);
    expect(c.signal.whenAborted).toBe(c.signal.whenAborted);
  });

  it('R4 delays accept TimeSpans from another copy of the package (duck-typed)', () => {
    const foreign = { milliseconds: 1000 } as TimeSpan;
    expect(() => new EnhancedAbortController().abortAfter(foreign)).not.toThrow();
  });

  it('R5 a synthetic abort event does not disarm a live controller', () => {
    vi.useFakeTimers();
    try {
      const c = new EnhancedAbortController().abortAfter(100);
      c.signal.dispatchEvent(new Event('abort'));
      vi.advanceTimersByTime(200);
      expect(c.isAborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('R6 a registration is disposed once its callback has run', () => {
    const c = new AbortController();
    const r = register(c.signal, () => {});
    c.abort();
    expect(r.isDisposed).toBe(true);
  });

  it('R7 static factories return the subclass', () => {
    class Mine extends EnhancedAbortController {}
    expect(Mine.timeout(1000)).toBeInstanceOf(Mine);
    expect(Mine.createLinkedController()).toBeInstanceOf(Mine);
    expect(Mine.linkSignals()).toBeInstanceOf(Mine);
  });

  it('R8 optional (undefined) signals are skipped when linking', () => {
    const parent = new AbortController();
    const child = EnhancedAbortController.createLinkedController(undefined, parent.signal, null);
    parent.abort('p');
    expect(child.reason).toBe('p');
  });

  it('EnhancedAbortSignal.timeout handles delays past setTimeout limits', () => {
    vi.useFakeTimers();
    try {
      const s = EnhancedAbortSignal.timeout(TimeSpan.fromDays(30));
      vi.advanceTimersByTime(TimeSpan.fromDays(29).milliseconds);
      expect(s.aborted).toBe(false);
      vi.advanceTimersByTime(TimeSpan.fromDays(1).milliseconds);
      expect(isTimeoutError(s.reason)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
