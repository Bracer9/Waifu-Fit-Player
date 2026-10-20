import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CoverArt } from './CoverArt';
import { READY_COUNTDOWN, type ReadyCountdownPhase } from '../ready-countdown';
import type { MenuSoundPlayer } from '../useMenuSounds';
import type { ChartType } from '../chart-types';

export function GameStartCountdown({
  cover,
  chartType,
  ready,
  resuming = false,
  onPhase,
  onComplete,
  onFinished,
  onCancel,
  onSound,
}: {
  cover: string;
  chartType: ChartType;
  ready: boolean;
  resuming?: boolean;
  onPhase: (phase: ReadyCountdownPhase) => void;
  onComplete: () => void;
  onFinished: () => void;
  onCancel: () => void;
  onSound: MenuSoundPlayer;
}) {
  const [remaining, setRemaining] = useState<number | 'GO!' | null>(null);
  const [phase, setPhase] = useState<ReadyCountdownPhase>('waiting');
  const [imageReady, setImageReady] = useState(!cover);
  const [imageFailed, setImageFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onPhase, onComplete, onFinished, onCancel, onSound });
  callbacks.current = { onPhase, onComplete, onFinished, onCancel, onSound };
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!ready || !imageReady) {
      setPhase('waiting');
      setRemaining(null);
      callbacks.current.onPhase('waiting');
      return;
    }
    setPhase('counting');
    callbacks.current.onPhase('counting');
    // Power the room and lanes first, then reveal 3 and start the counted beats.
    setRemaining(null);
    const timers = [0, 1, 2].map((beat) =>
      setTimeout(
        () => {
          setRemaining(3 - beat);
          callbacks.current.onSound('settings');
        },
        READY_COUNTDOWN.introMs + READY_COUNTDOWN.beatMs * beat,
      ),
    );
    timers.push(
      setTimeout(
        () => {
          setRemaining('GO!');
          setPhase('go');
          // Start the existing media clock now, while the prepared cover reveals it.
          callbacks.current.onComplete();
        },
        READY_COUNTDOWN.introMs + READY_COUNTDOWN.beatMs * 3,
      ),
    );
    timers.push(
      setTimeout(
        () => callbacks.current.onFinished(),
        READY_COUNTDOWN.introMs + READY_COUNTDOWN.beatMs * 3 + READY_COUNTDOWN.revealMs,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [ready, imageReady]);

  useEffect(() => {
    if (phase === 'go') return;
    const key = (event: KeyboardEvent) => {
      if (
        ![
          ' ',
          'Enter',
          'Tab',
          'Escape',
          'Backspace',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && (event.key === 'Escape' || event.key === 'Backspace'))
        callbacks.current.onCancel();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [phase]);

  return (
    <div
      className="ready-countdown"
      role="dialog"
      aria-label="开始倒计时"
      data-phase={phase}
      data-chart-type={chartType}
      data-resuming={resuming ? '' : undefined}
      ref={root}
      tabIndex={-1}
    >
      <div
        className="ready-cover"
        onLoadCapture={() => setImageReady(true)}
        onErrorCapture={() => {
          setImageFailed(true);
          setImageReady(true);
        }}
        aria-hidden="true"
      >
        <CoverArt src={imageFailed ? undefined : cover} eager />
      </div>
      <div className="ready-shade" aria-hidden="true" />
      <div className="ready-glitch" aria-hidden="true" />
      <svg
        className="ready-ornaments"
        viewBox="0 0 960 540"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern id="ready-halftone" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.15" fill="currentColor" />
          </pattern>
        </defs>
        <g fill="url(#ready-halftone)">
          <path d="M0 0h180L0 135zM960 540H780l180-135zM960 0v125L850 0zM0 540V400l125 140z" />
        </g>
        <g className="ready-pink">
          <path d="m65 115 85-100h15l-85 100zM795 525l90-104h18l-90 104zM0 415l85-100v48L0 463z" />
          <path
            d="M105 245v22m-11-11h22M824 383v19m-9-10h18"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          />
        </g>
        <g className="ready-cyan">
          <path d="m0 185 55-64h28L0 219zM960 15l-71 82h-30l71-82zM960 395l-73 85h-27l100-116z" />
          <path
            d="M725 212v15m-7-8h15M280 425v20m-10-10h20"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
        </g>
      </svg>
      <div className="ready-stage">
        <span className="ready-label">GET READY</span>
        <strong
          key={remaining}
          className={`ready-number${remaining === 3 ? ' is-initial' : ''}${phase === 'go' ? ' is-go' : ''}`}
          role="timer"
          aria-hidden={remaining === null}
          aria-live="polite"
        >
          {remaining}
        </strong>
        <div className="ready-progress" aria-hidden="true">
          <div className="ready-progress-track">
            <span className="ready-progress-fill" />
            <i className="ready-progress-front" />
          </div>
        </div>
      </div>
      <small className="ready-cancel">ESC / BACK · {resuming ? '返回暂停' : '返回选曲'}</small>
    </div>
  );
}
