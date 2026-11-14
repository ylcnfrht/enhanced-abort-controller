import { useEffect, useRef, useState } from 'preact/hooks';
import { EnhancedAbortController, isTimeoutError, type AbortRegistration } from '@ylcnfrht/enhanced-abort-controller';
import { describeReason } from './fake-fetch.ts';
import './demo.css';
import './widgets.css';

type Tone = 'dim' | 'ok' | 'timeout' | 'cancel' | 'callback' | 'err';
interface Line { at: number; text: string; tone?: Tone }

/**
 * One real EnhancedAbortController on a wall-clock timeline. The buttons call the library; the widget only records
 * what it asked for (deadline markers) and listens to the signal for what actually happened.
 */
export default function TimelineSimulator() {
  const [delay, setDelay] = useState(3000);
  const [, setTick] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const c = useRef<EnhancedAbortController>(null!);
  const t0 = useRef(0);
  const deadlines = useRef<{ at: number; live: boolean }[]>([]);
  const regs = useRef<AbortRegistration[]>([]);
  const end = useRef<{ at: number; kind: 'timeout' | 'cancel' } | null>(null);
  const disposedAt = useRef<number | null>(null);

  const now = () => Math.round(performance.now() - t0.current);
  const log = (text: string, tone?: Tone) => setLines((l) => [...l, { at: now(), text, tone }]);
  const refresh = () => setTick((t) => t + 1);

  function reset() {
    c.current?.abort();
    const controller = new EnhancedAbortController();
    t0.current = performance.now();
    deadlines.current = [];
    regs.current = [];
    end.current = null;
    disposedAt.current = null;
    controller.signal.addEventListener('abort', () => {
      const kind = isTimeoutError(controller.reason) ? 'timeout' : 'cancel';
      end.current = { at: now(), kind };
      for (const d of deadlines.current) d.live = false;
      log(`signal aborted · reason: ${describeReason(controller.reason)}`, kind);
      refresh();
    });
    c.current = controller;
    setLines([{ at: 0, text: 'const controller = new EnhancedAbortController()', tone: 'dim' }]);
    refresh();
  }

  function call(label: string, fn: () => void) {
    // Log the call first: an abort() fires its listeners (and their log lines) synchronously inside fn().
    log(label, 'dim');
    try {
      fn();
    } catch (e) {
      log(`  threw ${(e as Error).name}: ${(e as Error).message}`, 'err');
    }
    refresh();
  }

  function abortAfter(ms: number) {
    const controller = c.current;
    call(`controller.abortAfter(${ms === Infinity ? 'Infinity' : ms})`, () => {
      controller.abortAfter(ms);
      // Mirror what the call did: once aborted it is a no-op; otherwise the old deadline is replaced.
      if (controller.isAborted) return;
      for (const d of deadlines.current) d.live = false;
      if (ms !== Infinity) deadlines.current.push({ at: now() + ms, live: true });
    });
  }

  function addCallback() {
    const n = regs.current.length + 1;
    const controller = c.current;
    call(`controller.signal.register(cb${n})`, () => {
      const r = controller.signal.register((reason) => log(`cb${n} ran with ${describeReason(reason)}`, 'callback'));
      regs.current.push(r);
    });
  }

  function dispose() {
    const controller = c.current;
    call('controller.dispose()', () => {
      controller.dispose();
      if (disposedAt.current === null) disposedAt.current = now();
      for (const d of deadlines.current) d.live = false;
    });
  }

  useEffect(() => {
    reset();
    return () => c.current?.abort();
  }, []);

  // Animate while something can still happen on the clock.
  const controller = c.current;
  const pending = deadlines.current.some((d) => d.live);
  const elapsed = end.current?.at ?? (controller ? now() : 0);
  const animate = !!controller && !end.current && (pending || elapsed < 8000);
  useEffect(() => {
    if (!animate) return;
    let raf = requestAnimationFrame(function tick() {
      refresh();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  if (!controller) return <div class="io-demo io-tl" />;

  const lastDeadline = Math.max(0, ...deadlines.current.map((d) => d.at));
  const span = Math.max(8000, Math.ceil((Math.max(elapsed, lastDeadline) + 1500) / 2000) * 2000);
  const pct = (ms: number) => `${Math.min(100, (ms / span) * 100)}%`;
  const liveRegs = regs.current.filter((r) => !r.isDisposed).length;
  const state = controller.isAborted ? (end.current?.kind ?? 'cancel') : controller.isDisposed ? 'disposed' : 'live';

  return (
    <div class="io-demo io-tl">
      <div class="io-row">
        <label class="io-field" style={{ minWidth: '12rem', flex: 1 }}>
          Delay <output>{delay} ms</output>
          <input type="range" min={500} max={6000} step={250} value={delay} onInput={(e) => setDelay(+(e.target as HTMLInputElement).value)} />
        </label>
        <button type="button" class="io-btn" data-primary onClick={() => abortAfter(delay)}>abortAfter({delay})</button>
        <button type="button" class="io-btn" onClick={() => abortAfter(Infinity)}>abortAfter(Infinity)</button>
      </div>
      <div class="io-row">
        <button type="button" class="io-btn io-small" onClick={() => call('controller.abort()', () => controller.abort())}>abort()</button>
        <button type="button" class="io-btn io-small" onClick={() => call("controller.abort(new Error('user cancelled'))", () => controller.abort(new Error('user cancelled')))}>abort(new Error)</button>
        <button type="button" class="io-btn io-small" onClick={addCallback}>signal.register(cb)</button>
        <button type="button" class="io-btn io-small" onClick={() => {
          const i = regs.current.findLastIndex((r) => !r.isDisposed);
          call(`registration${i + 1}.unregister()`, () => regs.current[i]?.unregister());
        }} disabled={!liveRegs}>unregister last</button>
        <button type="button" class="io-btn io-small" onClick={dispose}>dispose()</button>
        <button type="button" class="io-btn io-small" onClick={reset} style={{ marginLeft: 'auto' }}>New controller</button>
      </div>
      <div>
        <div class="io-track" role="img" aria-label={`Timeline: ${elapsed} ms elapsed, state ${state}`}>
          <div class="io-track-fill" data-k={state === 'live' ? undefined : state} style={{ width: pct(elapsed) }} />
          {deadlines.current.map((d, i) => (
            <div key={i} class="io-mark" data-old={d.live ? undefined : ''} data-flip={d.at > span * 0.8 ? '' : undefined} style={{ left: pct(d.at) }}>
              <span>deadline {d.at} ms</span>
            </div>
          ))}
        </div>
        <div class="io-axis" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{((span * f) / 1000).toFixed(1)} s</span>)}
        </div>
      </div>
      <div class="io-tl-grid">
        <pre class="io-log" aria-live="polite">
          {lines.map((l, i) => (
            <div key={i} class={l.tone ? `is-${l.tone}` : undefined}><span class="t">{String(l.at).padStart(5, ' ')}</span>{l.text}</div>
          ))}
        </pre>
        <div class="io-tl-side">
          <div class="io-stats">
            <div class="io-stat"><b><span class="io-chip" data-k={state}>{state}</span></b><span>state</span></div>
            <div class="io-stat"><b>{pending ? 'yes' : 'no'}</b><span>timer pending</span></div>
            <div class="io-stat"><b>{String(controller.isAborted)}</b><span>signal.aborted</span></div>
            <div class="io-stat"><b>{String(controller.isDisposed)}</b><span>isDisposed</span></div>
            <div class="io-stat"><b>{liveRegs}</b><span>live callbacks</span></div>
            <div class="io-stat"><b class="is-small">{controller.isAborted ? (controller.reason as Error)?.name ?? String(controller.reason) : 'none'}</b><span>reason.name</span></div>
          </div>
          <div class="io-legend">
            <span><span class="io-chip" data-k="timeout">TimeoutError</span> deadline fired</span>
            <span><span class="io-chip" data-k="cancel">AbortError / yours</span> abort()</span>
          </div>
        </div>
      </div>
      <p class="io-hint">
        Try: abortAfter twice (the first deadline is replaced), abortAfter(Infinity) (cancelled), dispose() then abortAfter (throws) and abort() (still works).
      </p>
    </div>
  );
}
