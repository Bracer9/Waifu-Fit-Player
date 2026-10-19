import { ArrowLeft, ChevronRight, CornerDownLeft, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Chart } from '../model';
import { CoverArt } from './CoverArt';

const options = [
  { label: 'RESUME', Icon: Play },
  { label: 'RESTART', Icon: RotateCcw },
  { label: 'BACK TO SELECT', Icon: ArrowLeft },
] as const;

export function PracticePause({
  chart,
  cover,
  trigger,
  onResume,
  onRestart,
  onBack,
}: {
  chart: Chart;
  cover: string;
  trigger: RefObject<HTMLButtonElement | null>;
  onResume: () => void;
  onRestart: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [pressed, setPressed] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actions = useRef([onResume, onRestart, onBack]);
  actions.current = [onResume, onRestart, onBack];

  const activate = (index: number) => {
    if (timer.current !== null) return;
    setSelected(index);
    setPressed(index);
    // Keep the same brief confirmation pulse for pointer and keyboard input.
    timer.current = setTimeout(() => {
      timer.current = null;
      setPressed(null);
      actions.current[index]();
    }, 150);
  };

  useLayoutEffect(() => {
    const panel = root.current;
    buttons.current[0]?.focus({ preventScroll: true });
    return () => {
      if (panel?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [trigger]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Backspace', ' '].includes(event.key))
        return;
      if (timer.current !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const next =
          (selected + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        setSelected(next);
        buttons.current[next]?.focus({ preventScroll: true });
      } else if (
        event.key === 'Enter' &&
        !(event.target instanceof Element && event.target.closest('.practice-pause'))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) activate(selected);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  return (
    <div
      id="practice-pause-menu"
      className="practice-pause-overlay"
      role="dialog"
      aria-labelledby="practice-pause-title"
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="pause-console" ref={root}>
        <div className="pause-banner">
          <div>
            <span className="pause-banner-icon">
              <Pause fill="currentColor" aria-hidden="true" />
            </span>
            <h2 id="practice-pause-title">PAUSED</h2>
          </div>
        </div>
        <div className="pause-track">
          <div className="pause-track-content">
            <div className="pause-track-cover">
              <CoverArt src={cover} eager />
            </div>
            <div>
              <strong title={chart.title}>{chart.title}</strong>
              <small>
                {(chart.difficulty ?? 'hard').toUpperCase()} / Lv. {chart.difficultyRating ?? '—'}
              </small>
            </div>
          </div>
        </div>
        <div className="pause-options" aria-label="暂停选项">
          {options.map(({ label, Icon }, index) => (
            <button
              key={label}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              className={`pause-option${pressed === index ? ' is-pressed' : ''}`}
              data-selected={selected === index}
              onFocus={() => {
                if (timer.current === null) setSelected(index);
              }}
              onPointerMove={(event) => {
                const { clientX: x, clientY: y } = event;
                if (pointer.current?.x === x && pointer.current.y === y) return;
                pointer.current = { x, y };
                if (timer.current === null) setSelected(index);
              }}
              onClick={() => activate(index)}
            >
              <span className="pause-option-content">
                <Icon aria-hidden="true" fill={index === 0 ? 'currentColor' : 'none'} />
                <span>{label}</span>
                <ChevronRight className="pause-option-arrow" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
        <div className="pause-key-hints" aria-hidden="true">
          <kbd>ESC</kbd>
          <span>/ Back · Resume</span>
          <i />
          <kbd>
            <CornerDownLeft />
          </kbd>
          <span>Confirm</span>
        </div>
      </div>
    </div>
  );
}
