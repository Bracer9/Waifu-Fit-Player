import { ArrowRight, ListMusic, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Chart } from '../model';
import { AFTER_SHOW_FINISH, afterShowPadInput, afterShowSummary } from '../after-show';
import { formatTime } from '../timing';
import type { MenuSoundPlayer } from '../useMenuSounds';
import { MusicPulse } from './MenuMusic';
import type { MenuMusic } from '../useMenuMusic';
import '../after-show.css';

const options = [
  { label: 'ENCORE', caption: '再来一遍', Icon: RotateCcw },
  { label: 'NEXT TRACK', caption: '下一首', Icon: SkipForward },
  { label: 'BACK TO SELECT', caption: '返回选曲', Icon: ListMusic },
] as const;

function AfterShowMetrics({ summary }: { summary: ReturnType<typeof afterShowSummary> }) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    setElapsed(null);
    let frame = 0;
    const timer = window.setTimeout(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setElapsed(AFTER_SHOW_FINISH.metricsCountMs);
        return;
      }
      const start = performance.now();
      let last = -Infinity;
      setElapsed(0);
      const tick = (now: number) => {
        const time = Math.min(AFTER_SHOW_FINISH.metricsCountMs, now - start);
        if (time === AFTER_SHOW_FINISH.metricsCountMs || now - last >= 1000 / 30) {
          setElapsed(time);
          last = now;
        }
        if (time < AFTER_SHOW_FINISH.metricsCountMs) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, AFTER_SHOW_FINISH.metricsDelayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [summary]);
  const ease = (duration: number) => 1 - (1 - Math.min(1, (elapsed ?? 0) / duration)) ** 3;
  const duration = elapsed === null ? '' : formatTime(summary.durationMs * ease(1200));
  const bpm =
    elapsed === null
      ? ''
      : summary.bpm === undefined
        ? '—'
        : elapsed >= 1100
          ? summary.bpm
          : Math.floor(summary.bpm * ease(1100));
  const kcal =
    elapsed === null
      ? ''
      : (summary.estimatedKcal * ease(AFTER_SHOW_FINISH.metricsCountMs)).toFixed(1);
  return (
    <dl className="after-show-metrics">
      <div>
        <dt>DURATION</dt>
        <dd>{duration || '\u00a0'}</dd>
      </div>
      <div>
        <dt>BPM</dt>
        <dd>{bpm === '' ? '\u00a0' : bpm}</dd>
      </div>
      <div>
        <dt>EST. BURN</dt>
        <dd>
          <span
            className="after-show-kcal-number"
            style={{ width: `${summary.estimatedKcal.toFixed(1).length}ch` }}
          >
            {kcal || '\u00a0'}
          </span>{' '}
          <small>KCAL</small>
        </dd>
      </div>
    </dl>
  );
}

export function AfterShow({
  chart,
  durationMs,
  music,
  hasNext,
  disabled,
  onEncore,
  onNext,
  onBack,
  onSound,
}: {
  chart: Chart;
  durationMs: number;
  music: MenuMusic;
  hasNext: boolean;
  disabled: boolean;
  onEncore: () => void;
  onNext: () => Promise<void>;
  onBack: () => void;
  onSound: MenuSoundPlayer;
}) {
  const summary = useMemo(() => afterShowSummary(chart, durationMs), [chart, durationMs]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selection = useRef(0);
  const [selected, setSelected] = useState(0);
  const [locked, setLocked] = useState(false);
  const acting = useRef(false);
  const alive = useRef(true);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ disabled, hasNext, onEncore, onNext, onBack, onSound });
  latest.current = { disabled, hasNext, onEncore, onNext, onBack, onSound };
  const select = (index: number, focus = false) => {
    if (acting.current || latest.current.disabled || (index === 1 && !latest.current.hasNext))
      return;
    if (index !== selection.current) {
      selection.current = index;
      setSelected(index);
      latest.current.onSound('settings');
    }
    if (focus) buttons.current[index]?.focus({ preventScroll: true });
  };
  const move = (direction: number) => {
    let next = selection.current;
    do {
      next = (next + direction + options.length) % options.length;
    } while (next === 1 && !latest.current.hasNext);
    select(next, true);
  };
  const activate = (index: number) => {
    if (acting.current || latest.current.disabled || (index === 1 && !latest.current.hasNext))
      return;
    acting.current = true;
    setLocked(true);
    const actions = [latest.current.onEncore, latest.current.onNext, latest.current.onBack];
    void Promise.resolve()
      .then(actions[index])
      .finally(() => {
        acting.current = false;
        if (alive.current) setLocked(false);
      });
  };
  const input = useRef({ move, activate });
  input.current = { move, activate };

  useLayoutEffect(() => {
    alive.current = true;
    buttons.current[0]?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (latest.current.disabled || event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Enter',
          ' ',
          'Escape',
          'Backspace',
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key.startsWith('Arrow'))
        input.current.move(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
      else if (!event.repeat)
        input.current.activate(['Escape', 'Backspace'].includes(event.key) ? 2 : selection.current);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  useEffect(() => {
    let frame = 0;
    let previous: ReturnType<typeof afterShowPadInput> | undefined;
    let repeatAt = 0;
    const pads = () =>
      Array.from(navigator.getGamepads?.() ?? []).filter(
        (pad): pad is Gamepad => !!pad && pad.connected,
      );
    const tick = (now: number) => {
      frame = 0;
      const pad = pads()[0];
      if (!pad) {
        previous = undefined;
        return;
      }
      const next = afterShowPadInput(pad);
      if (!latest.current.disabled && !document.hidden && document.hasFocus()) {
        if (previous) {
          if (next.back && !previous.back) input.current.activate(2);
          else if (next.confirm && !previous.confirm) input.current.activate(selection.current);
          else if (next.direction && (next.direction !== previous.direction || now >= repeatAt)) {
            input.current.move(next.direction);
            repeatAt = now + (next.direction !== previous.direction ? 350 : 160);
          }
        }
        previous = next;
      } else previous = undefined;
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame && pads().length) frame = requestAnimationFrame(tick);
    };
    start();
    window.addEventListener('gamepadconnected', start);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('gamepadconnected', start);
    };
  }, []);

  return (
    <section className="after-show" aria-labelledby="after-show-title" aria-busy={locked}>
      <MusicPulse music={music} waveform={false} />
      <span className="practice-panel-print" aria-hidden="true" />
      <div className="after-show-wordmark">
        WAIFU <b>FIT</b> PLAYER
      </div>
      <div className="after-show-heading">
        <p className="after-show-kicker">LIVE END ///</p>
        <h2 id="after-show-title" aria-label="TRACK FINISHED">
          <span>TRACK</span>
          <span>FINISHED</span>
        </h2>
        <p className="after-show-tagline">
          YOUR MUSIC.
          <br />
          YOUR MOVEMENT.
        </p>
        <i className="after-show-slash" aria-hidden="true" />
      </div>
      <AfterShowMetrics summary={summary} />
      <div className="after-show-actions" aria-label="曲终操作">
        {options.map(({ label, caption, Icon }, index) => (
          <button
            type="button"
            key={label}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            className={`button after-show-option${index === 0 ? ' primary' : ''}`}
            data-selected={selected === index}
            disabled={disabled || locked || (index === 1 && !hasNext)}
            title={index === 1 && !hasNext ? '当前专辑没有其他已发布曲目' : undefined}
            onFocus={() => select(index)}
            onPointerMove={(event) => {
              const { clientX: x, clientY: y } = event;
              if (pointer.current?.x === x && pointer.current.y === y) return;
              pointer.current = { x, y };
              select(index);
            }}
            onClick={() => activate(index)}
          >
            <Icon aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{caption}</small>
            </span>
            <ArrowRight className="after-show-button-arrow" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="after-show-key-hints">
        ← → SELECT <span>ENTER / A CONFIRM</span>
        <span>ESC / B BACK</span>
      </p>
    </section>
  );
}
