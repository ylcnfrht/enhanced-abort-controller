import { useEffect, useRef, useState } from 'preact/hooks';
import { EnhancedAbortController, isTimeoutError } from '@ylcnfrht/enhanced-abort-controller';
import { describeReason } from './fake-fetch.ts';
import './demo.css';
import './widgets.css';

interface Child {
  id: number;
  name: string;
  delay: number;
  deadline: number;
  endedAt?: number;
  stop?: () => void;
  controller: EnhancedAbortController;
}

const STEPS: [string, number][] = [
  ['load user', 1500],
  ['query orders', 3000],
  ['render pdf', 5000],
];

/**
 * Wraps a signal's add/removeEventListener to count its 'abort' listeners: browsers have no getEventListeners().
 * Only listeners added after the wrap are seen, which is all of them for a fresh signal.
 */
function countListeners(signal: AbortSignal, onChange: () => void) {
  const live = new Set<unknown>();
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    if (type === 'abort' && listener) live.add(listener);
    add(type, listener, options);
    onChange();
  };
  signal.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
    if (type === 'abort') live.delete(listener);
    remove(type, listener, options);
    onChange();
  };
  // Every listener the library adds is { once: true }: firing removes them all.
  add('abort', () => (live.clear(), onChange()));
  return () => live.size;
}

/** A request signal with per-step children: abort the parent, let a child time out, watch reasons and listener counts. */
export default function LinkedSignals() {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const parent = useRef<AbortController>(null!);
  const listeners = useRef<() => number>(() => 0);
  const children = useRef<Child[]>([]);
  const t0 = useRef(0);
  const nextId = useRef(1);
  const [stress, setStress] = useState<string>();

  function newRequest() {
    parent.current?.abort();
    for (const c of children.current) c.controller.dispose();
    const p = new AbortController();
    listeners.current = countListeners(p.signal, refresh);
    parent.current = p;
    children.current = [];
    nextId.current = 1;
    t0.current = performance.now();
    setStress(undefined);
    for (const [name, deadline] of STEPS) addChild(name, deadline);
    refresh();
  }

  function addChild(name: string, delay: number) {
    const controller = EnhancedAbortController.createLinkedController(parent.current.signal).abortAfter(delay);
    const now = performance.now() - t0.current;
    const child: Child = { id: nextId.current++, name, delay, deadline: Math.round(now + delay), controller };
    const stop = () => {
      child.endedAt ??= performance.now() - t0.current;
      refresh();
    };
    controller.signal.addEventListener('abort', stop);
    child.stop = stop;
    children.current.push(child);
    refresh();
  }

  function burst() {
    const before = listeners.current();
    for (let i = 0; i < 1000; i++) {
      const child = EnhancedAbortController.createLinkedController(parent.current.signal).abortAfter(60_000);
      if (i % 2) child.dispose();
      else child.abort();
    }
    setStress(`1000 children created, then aborted or disposed: parent listeners ${before} → ${listeners.current()}`);
  }

  useEffect(() => {
    newRequest();
    return () => parent.current?.abort();
  }, []);

  const p = parent.current;
  const elapsed = performance.now() - t0.current;
  const active = !!p && !p.signal.aborted && children.current.some((c) => !c.controller.isAborted && !c.controller.isDisposed);
  useEffect(() => {
    if (!active) return;
    let raf = requestAnimationFrame(function tick() {
      refresh();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!p) return <div class="io-demo io-ln" />;

  const span = 6000;
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / span) * 100))}%`;
  const count = listeners.current();

  return (
    <div class="io-demo io-ln">
      <div class="io-row">
        <button type="button" class="io-btn" data-primary onClick={() => p.abort(new Error('client disconnected'))} disabled={p.signal.aborted}>
          Abort parent (client disconnected)
        </button>
        <button type="button" class="io-btn io-small" onClick={() => addChild(`step ${nextId.current}`, 2000)} disabled={p.signal.aborted}>+ child (2 s)</button>
        <button type="button" class="io-btn io-small" onClick={burst}>1000 children</button>
        <button type="button" class="io-btn io-small" onClick={newRequest} style={{ marginLeft: 'auto' }}>New request</button>
      </div>
      <div class="io-ln-parent">
        <span class="io-ln-name">request.signal<small>new AbortController()</small></span>
        <span class="io-row">
          <span class="io-chip" data-k={p.signal.aborted ? 'cancel' : 'live'}>{p.signal.aborted ? 'aborted' : 'live'}</span>
          <span class="io-chip" data-k="callback">{count} abort listener{count === 1 ? '' : 's'}</span>
        </span>
        <span />
        {p.signal.aborted && <span class="io-ln-reason">reason: {describeReason(p.signal.reason)}</span>}
      </div>
      <ul class="io-ln-children">
        {children.current.map((c) => {
          const ctl = c.controller;
          const kind = ctl.isAborted ? (isTimeoutError(ctl.reason) ? 'timeout' : 'cancel') : ctl.isDisposed ? 'disposed' : 'live';
          const fromParent = ctl.isAborted && p.signal.aborted && ctl.reason === p.signal.reason;
          return (
            <li key={c.id} class="io-ln-child">
              <span class="io-ln-name">{c.name}<small>linked · abortAfter({c.delay})</small></span>
              <div class="io-track is-thin" aria-hidden="true">
                <div class="io-track-fill" data-k={kind === 'live' ? undefined : kind} style={{ width: pct(c.endedAt ?? elapsed) }} />
                <div class="io-mark" data-flip={c.deadline > span * 0.75 ? '' : undefined} style={{ left: pct(c.deadline) }}><span>{(c.deadline / 1000).toFixed(1)} s</span></div>
              </div>
              <span class="io-ln-actions">
                <span class="io-chip" data-k={kind}>{kind}</span>
                <button type="button" class="io-btn io-small" onClick={() => ctl.abort()} disabled={ctl.isAborted}>abort</button>
                <button type="button" class="io-btn io-small" onClick={() => (ctl.dispose(), c.stop?.())} disabled={ctl.isDisposed || ctl.isAborted}>dispose</button>
              </span>
              {ctl.isAborted && (
                <span class="io-ln-reason">
                  reason: {describeReason(ctl.reason)}
                  {fromParent ? ' · same object as the parent’s reason' : kind === 'timeout' ? ' · its own deadline; the parent is untouched' : ' · aborted directly; the parent is untouched'}
                </span>
              )}
              {!ctl.isAborted && ctl.isDisposed && <span class="io-ln-reason">disposed: timer and parent listener released, not aborted</span>}
            </li>
          );
        })}
      </ul>
      {stress && <p class="io-hint">{stress}</p>}
      <p class="io-hint">
        Each child holds one listener on <code>request.signal</code>. It is removed when the child aborts (any reason) or is disposed, so the count drops back to zero.
      </p>
    </div>
  );
}
