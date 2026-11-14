import { useEffect, useRef, useState } from 'preact/hooks';
import { EnhancedAbortController, TimeSpan, isAbortError, isTimeoutError } from '@ylcnfrht/enhanced-abort-controller';
import { fakeFetch } from './fake-fetch.ts';
import './demo.css';
import './widgets.css';
import './HeroDemo.css';

/** The snippet shown next to the output. `run` below does exactly this, with the real library and a simulated fetch. */
export const HERO_CODE = `import {
  EnhancedAbortController, TimeSpan, isAbortError, isTimeoutError,
} from '@ylcnfrht/enhanced-abort-controller';

const deadline = TimeSpan.fromSeconds(1.5);
using controller = new EnhancedAbortController().abortAfter(deadline);
controller.signal.register((reason) => console.log('cleanup', reason));

// abortAfter again replaces the deadline; abort() cancels now.
extend.onclick = () => controller.abortAfter(deadline);
cancel.onclick = () => controller.abort();

try {
  const res = await fetch('/api/report', { signal: controller.signal });
  console.log(res.status, 'OK'); // the request takes 2 s
} catch (error) {
  if (!isAbortError(error)) throw error;
  console.log(isTimeoutError(error) ? 'timed out' : 'cancelled');
}`;

const REQUEST_MS = 2000;
const DEADLINE_MS = 1500;
const WINDOW_MS = 3200;

type Tone = 'dim' | 'ok' | 'timeout' | 'cancel' | 'callback';
interface Line { at: number; text: string; tone?: Tone }
type Phase = 'idle' | 'running' | 'ok' | 'timeout' | 'cancel';

/** Landing-page widget: a request racing a resettable deadline. */
export default function HeroDemo() {
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [deadlines, setDeadlines] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<EnhancedAbortController>();
  const t0 = useRef(0);
  const runId = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  const now = () => Math.round(performance.now() - t0.current);
  const log = (text: string, tone?: Tone) => setLines((l) => [...l, { at: now(), text, tone }]);

  async function run() {
    const id = ++runId.current;
    // A restarted run's old request still settles: ignore what it reports.
    const live = () => id === runId.current;
    const say = (text: string, tone?: Tone) => live() && log(text, tone);
    controller.current?.abort();
    t0.current = performance.now();
    setLines([]);
    setDeadlines([DEADLINE_MS]);
    setElapsed(0);
    setPhase('running');
    // `using` would dispose at the end of this block; the explicit finally does the same in every browser.
    const c = new EnhancedAbortController().abortAfter(TimeSpan.fromMilliseconds(DEADLINE_MS));
    controller.current = c;
    c.signal.register((reason) => say(`cleanup ${(reason as Error).name}`, 'callback'));
    say(`fetch('/api/report')  deadline ${DEADLINE_MS} ms`, 'dim');
    try {
      const response = await fakeFetch(REQUEST_MS, c.signal);
      say(`${response.status} OK`, 'ok');
      if (live()) setPhase('ok');
    } catch (error) {
      if (!isAbortError(error)) throw error;
      const timedOut = isTimeoutError(error);
      say(timedOut ? 'timed out' : 'cancelled', timedOut ? 'timeout' : 'cancel');
      if (live()) setPhase(timedOut ? 'timeout' : 'cancel');
    } finally {
      c.dispose();
      if (live()) setElapsed(now());
    }
  }

  function extend() {
    controller.current?.abortAfter(TimeSpan.fromMilliseconds(DEADLINE_MS));
    setDeadlines((d) => [...d, now() + DEADLINE_MS]);
    log(`abortAfter(${DEADLINE_MS})  new deadline at ${now() + DEADLINE_MS} ms`, 'dim');
  }

  // Auto-play once, when scrolled into view.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        io.disconnect();
        void run();
      }
    });
    io.observe(root.current!);
    return () => {
      io.disconnect();
      controller.current?.abort();
    };
  }, []);

  // Drive the progress bar while the request runs.
  useEffect(() => {
    if (phase !== 'running') return;
    let raf = requestAnimationFrame(function tick() {
      setElapsed(now());
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const pct = (ms: number) => `${Math.min(100, (ms / WINDOW_MS) * 100)}%`;
  const running = phase === 'running';
  const fillKind = phase === 'timeout' ? 'timeout' : phase === 'cancel' ? 'cancel' : phase === 'ok' ? 'done' : undefined;

  return (
    <div class="io-hero-out io-demo" ref={root}>
      <div class="io-hero-head">
        <span class="io-hero-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>live · real library, simulated fetch</span>
        <button type="button" class="io-hero-replay" onClick={() => void run()}>{running ? 'Restart' : 'Run'}</button>
      </div>
      <div class="io-hero-body">
        <div class="io-track" role="img" aria-label={`Request progress ${elapsed} ms of ${REQUEST_MS} ms`}>
          <div class="io-track-fill" data-k={fillKind} style={{ width: pct(Math.min(elapsed, REQUEST_MS)) }} />
          <div class="io-mark" data-k="end" style={{ left: pct(REQUEST_MS) }}><span>response</span></div>
          {deadlines.map((d, i) => (
            <div key={i} class="io-mark" data-old={i < deadlines.length - 1 ? '' : undefined} data-flip={d > WINDOW_MS * 0.75 ? '' : undefined} style={{ left: pct(d) }}>
              <span>deadline</span>
            </div>
          ))}
        </div>
        <div class="io-row io-hero-actions">
          <button type="button" class="io-btn io-small" onClick={extend} disabled={!running}>Extend (abortAfter 1.5 s)</button>
          <button type="button" class="io-btn io-small" onClick={() => controller.current?.abort()} disabled={!running}>Cancel (abort)</button>
        </div>
      </div>
      <pre aria-live="polite">
        {lines.map((l, i) => (
          <div key={i} class={l.tone ? `is-${l.tone}` : undefined}>
            <span class="io-hero-t">{String(l.at).padStart(4, ' ')} ms</span>
            {l.text}
          </div>
        ))}
        {phase === 'timeout' && <div class="is-dim">Press Run, then Extend before the deadline to let the request finish.</div>}
        <span class="io-hero-caret" aria-hidden="true" />
      </pre>
    </div>
  );
}
