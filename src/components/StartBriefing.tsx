import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Dumbbell, PersonStanding } from 'lucide-react';
import type { ChartType, Song } from '../library';
import type { Lane } from '../model';
import { INTENSITY_LABELS, ratingValue } from '../chart-types';
import { chartArtist, focusMoves, START_BRIEFING } from '../start-briefing';
import { createCalorieIndex } from '../calories';
import { playableChart, playDuration } from '../play-range';
import { chartTimeAt, formatTime, segmentAt } from '../timing';
import type { MenuSoundPlayer } from '../useMenuSounds';
import { CoverArt } from './CoverArt';
import { CoverTrace } from './CoverTrace';
import { LaneGlyph } from './Glyph';
import { ModalBackdrop } from './ModalBackdrop';
import { useBriefingMotion } from '../useBriefingMotion';
import '../start-briefing.css';

const moveNames: Record<Lane, string> = {
  punch: '手臂',
  step: '踏步',
  side_crunch: '侧腹',
  squat: '深蹲',
  calf_raise: '提踵',
};
const cells = Array.from({ length: 112 }, (_, index) => <i key={index} />);

export function StartBriefing({
  song,
  chartType,
  available,
  albumName,
  onChartType,
  onClose,
  onStart,
  onSound,
}: {
  song: Song;
  chartType: ChartType;
  available: ChartType[];
  albumName: string;
  onChartType: (type: ChartType) => void;
  onClose: () => void;
  onStart: () => void;
  onSound: MenuSoundPlayer;
}) {
  const edition = song.released[chartType]!;
  const chart = edition.chart;
  const moves = useMemo(() => focusMoves(chart), [chart]);
  const kcal = useMemo(
    () => createCalorieIndex(playableChart(chart).notes).at(-1)?.kcal ?? 0,
    [chart],
  );
  const bpm =
    segmentAt(chart.tempoSegments, chartTimeAt(chart, chart.playRange?.startMs ?? 0))?.bpm ??
    chart.tempoSegments[0]?.bpm;
  const root = useRef<HTMLElement>(null);
  const chargeControl = useRef<HTMLButtonElement>(null);
  const motion = useBriefingMotion(root, onClose);
  const frame = useRef(0);
  const stopCharge = useRef<(() => void) | null>(null);
  const completion = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useRef(0);
  const owner = useRef<'keyboard' | 'pointer' | null>(null);
  const phase = useRef<'idle' | 'holding' | 'complete'>('idle');
  const [state, setState] = useState(phase.current);
  const callbacks = useRef({ onClose, onStart, onSound, onChartType, available, chartType });
  callbacks.current = { onClose, onStart, onSound, onChartType, available, chartType };
  const ringId = useId();
  const titleId = useId();

  const paint = (value: number) => {
    progress.current = value;
    chargeControl.current?.style.setProperty('--start-charge', String(value));
  };
  const clear = () => {
    stopCharge.current?.();
    stopCharge.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (completion.current !== null) clearTimeout(completion.current);
    completion.current = null;
    owner.current = null;
  };
  const release = (audible = true) => {
    if (phase.current !== 'holding') return;
    const from = progress.current;
    clear();
    if (audible && from > 0.04) callbacks.current.onSound('release');
    phase.current = 'idle';
    setState('idle');
    const start = performance.now();
    const rollback = (now: number) => {
      const amount = Math.min(1, (now - start) / START_BRIEFING.releaseMs);
      paint(from * (1 - amount) ** 3);
      if (amount < 1) frame.current = requestAnimationFrame(rollback);
    };
    frame.current = requestAnimationFrame(rollback);
  };
  const finishCharge = () => {
    paint(1);
    const button = chargeControl.current;
    const ring = button?.querySelector<HTMLElement>('.start-charge-arrow');
    if (button && ring) {
      const panelStyle = getComputedStyle(button);
      const ringStyle = getComputedStyle(ring);
      const [ringX, ringY = '0px'] =
        ringStyle.translate === 'none' ? ['0px', '0px'] : ringStyle.translate.split(' ');
      // Read the live pose and dimensions together before writing styles. Interleaved
      // reads/writes here used to force repeated style flushes exactly at completion.
      const pose = {
        '--start-rest-transform': panelStyle.transform,
        '--start-locked-beat': panelStyle.getPropertyValue('--start-beat'),
        '--start-ring-scale': ringStyle.scale,
        '--start-ring-rotate': ringStyle.rotate,
        '--start-ring-x': ringX,
        '--start-ring-y': ringY,
        '--start-slide-distance': `${Math.max(0, button.clientWidth - ring.offsetWidth - 50)}px`,
      };
      for (const [name, value] of Object.entries(pose)) button.style.setProperty(name, value);
    }
    owner.current = null;
    phase.current = 'complete';
    setState('complete');
    stopCharge.current?.();
    stopCharge.current = null;
    callbacks.current.onSound('charged');
    completion.current = setTimeout(() => {
      completion.current = null;
      callbacks.current.onStart();
    }, START_BRIEFING.completionMs);
  };
  const begin = (source: 'keyboard' | 'pointer', quick = false) => {
    if (phase.current !== 'idle' || motion.isClosing()) return;
    clear();
    if (quick) {
      finishCharge();
      return;
    }
    owner.current = source;
    phase.current = 'holding';
    setState('holding');
    paint(0);
    const stop = callbacks.current.onSound('charge');
    stopCharge.current = typeof stop === 'function' ? stop : null;
    const start = performance.now();
    const charge = (now: number) => {
      const value = Math.min(1, (now - start) / START_BRIEFING.holdMs);
      // Ease only the visual fill. Completion still uses the unchanged hold duration.
      paint(1 - (1 - value) ** 3);
      if (value < 1) frame.current = requestAnimationFrame(charge);
      else finishCharge();
    };
    frame.current = requestAnimationFrame(charge);
  };
  const cancel = () => {
    if (motion.isClosing()) return;
    clear();
    callbacks.current.onSound('back');
    motion.close();
  };
  const selectType = (type: ChartType) => {
    if (
      motion.isClosing() ||
      phase.current === 'complete' ||
      !callbacks.current.available.includes(type)
    )
      return;
    clear();
    phase.current = 'idle';
    setState('idle');
    paint(0);
    if (type !== callbacks.current.chartType) callbacks.current.onChartType(type);
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!['Enter', 'Escape', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === 'Escape' || event.key === 'Backspace') cancel();
      else if (event.key === 'Enter') {
        if (event.target instanceof Element && event.target.closest('.briefing-cancel')) cancel();
        else begin('keyboard', event.shiftKey);
      } else selectType(event.key === 'ArrowLeft' ? 'fitness' : 'dance');
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (owner.current === 'keyboard') release();
    };
    const blur = () => {
      if (phase.current === 'complete') {
        clear();
        phase.current = 'idle';
        setState('idle');
        paint(0);
      } else release(false);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clear();
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const intensity = chart.intensity ? INTENSITY_LABELS[chart.intensity] : '—';
  const strength = chart.intensity ? { low: 1, medium: 3, high: 5 }[chart.intensity] : 0;
  return (
    <ModalBackdrop className="start-briefing-backdrop" onClose={cancel}>
      <section
        className="start-briefing"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={root}
        data-state={state}
        data-chart-type={chartType}
        style={
          {
            '--start-complete': `${START_BRIEFING.completionMs}ms`,
          } as CSSProperties
        }
      >
        <div className="briefing-geometry" aria-hidden="true">
          <i />
          <i />
          <i />
          <svg className="briefing-side-art" viewBox="0 0 1800 850" preserveAspectRatio="none">
            <defs>
              <pattern id={`${ringId}-dots`} width="11" height="11" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="3" r="1.5" fill="var(--briefing-pink)" />
              </pattern>
            </defs>
            <path
              className="briefing-art-dots"
              fill={`url(#${ringId}-dots)`}
              d="M0 210H100V800H0ZM1690 170H1800V790H1690ZM570 0H730V100H570Z"
            />
            <path
              className="briefing-art-arc"
              d="M93 158C-35 277-24 568 109 680M1713 125C1826 278 1818 521 1708 680"
            />
            <path
              className="briefing-art-hairline"
              d="M64 151L6 215M30 624L91 701M1756 210L1792 271M1775 555L1735 652"
            />
            <path
              fill="var(--briefing-cyan)"
              d="M13 117H23V192H13ZM0 405H59V420H0ZM1741 391H1800V405H1741ZM1765 453H1772V483H1765ZM18 723H36L15 807H0ZM1771 690H1784L1758 789H1745Z"
            />
            <path
              fill="var(--briefing-pink)"
              d="M0 457H57V472H0ZM18 626H85V641H18ZM1759 511H1800V525H1759ZM1738 581H1785V590H1738Z"
            />
          </svg>
        </div>
        <div className="briefing-topline" aria-hidden="true">
          <span>
            WAIFU FIT PLAYER <i />
          </span>
          <span>YOUR MUSIC. YOUR MOVEMENT.</span>
        </div>
        <div className="briefing-board">
          <div className="briefing-cover">
            <CoverArt src={edition.cover} eager />
            <span className="briefing-cover-ink" aria-hidden="true" />
            <span className="briefing-cover-grain" aria-hidden="true" />
            <span className="briefing-cover-fibers" aria-hidden="true" />
            <div className="briefing-cover-corners" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span className="briefing-cover-slash" aria-hidden="true" />
          </div>
          <div className="briefing-info">
            <div className="briefing-trackline">
              <span>TRACK</span>
              <i />
              <span>{albumName}</span>
              <b>///</b>
            </div>
            <div className="briefing-song-heading">
              <h2 id={titleId} title={chart.title}>
                {chart.title}
              </h2>
              <ArrowUpRight aria-hidden="true" />
              <div className="briefing-artist">
                <small>ARTIST</small>
                <span>{chartArtist(chart)}</span>
              </div>
            </div>
            <div className="briefing-mode-row">
              <span className="briefing-rating">
                {chartType === 'fitness' ? `INT. ${intensity}` : `LV. ${ratingValue(chart)}`}
              </span>
              <div className="briefing-modes" aria-label="确认谱面类型">
                {(['fitness', 'dance'] as const).map((type) => {
                  const Icon = type === 'fitness' ? Dumbbell : PersonStanding;
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-label={type.toUpperCase()}
                      aria-pressed={type === chartType}
                      disabled={!available.includes(type) || state === 'complete'}
                      onClick={() => selectType(type)}
                    >
                      <Icon aria-hidden="true" />
                      {type.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="briefing-metrics">
              <div>
                <small>BPM</small>
                <strong>{bpm ?? '—'}</strong>
              </div>
              <div>
                <small>TIME</small>
                <strong>{formatTime(playDuration(chart))}</strong>
              </div>
              <div className="briefing-level">
                <small>{chartType === 'fitness' ? 'INTENSITY' : 'DANCE LEVEL'}</small>
                <div>
                  {chartType === 'fitness' ? (
                    <>
                      <span className="briefing-strength" aria-hidden="true">
                        {Array.from({ length: 5 }, (_, i) => (
                          <i key={i} data-lit={i < strength} />
                        ))}
                      </span>
                      <strong data-intensity={chart.intensity}>{intensity}</strong>
                    </>
                  ) : (
                    <strong>
                      <em>LV.</em> {ratingValue(chart)}
                    </strong>
                  )}
                </div>
              </div>
              <div className="briefing-burn">
                <small>EST. BURN</small>
                <strong>
                  {kcal.toFixed(1)} <em>KCAL</em>
                </strong>
              </div>
            </div>
            <div className="briefing-focus-title">
              FOCUS MOVES <b>///</b>
              <span>主要动作</span>
            </div>
            <div className="briefing-focus" aria-label="主要动作构成">
              {moves.map((move) => (
                <div
                  className="briefing-move"
                  key={move.id}
                  data-prominent={move.prominent}
                  data-empty={!move.count}
                  data-lane={move.id}
                  aria-label={`${move.english} ${Math.round(move.share * 100)}%`}
                >
                  <div className="briefing-move-icon">
                    <LaneGlyph lane={move.id} />
                  </div>
                  <strong>{move.english}</strong>
                  <span>{moveNames[move.id]}</span>
                  <i
                    className="briefing-move-share"
                    style={{ '--move-share': move.share } as CSSProperties}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          className="start-charge"
          ref={chargeControl}
          type="button"
          aria-label="按住 Enter 开始游戏"
          aria-describedby={`${titleId}-hold`}
          onClick={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            begin('pointer');
          }}
          onPointerUp={(event) => {
            if (owner.current === 'pointer') release();
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            if (owner.current === 'pointer') release(false);
          }}
          onLostPointerCapture={() => {
            if (owner.current === 'pointer') release();
          }}
        >
          <CoverTrace inset={0} />
          <span className="start-charge-dots" aria-hidden="true" />
          <span className="start-charge-arrow" aria-hidden="true">
            <svg viewBox="0 0 200 200">
              <defs>
                <mask id={ringId}>
                  <circle
                    className="start-charge-ring-mask"
                    cx="100"
                    cy="100"
                    r="76"
                    pathLength="100"
                    fill="none"
                    stroke="white"
                    strokeWidth="14"
                    transform="rotate(-90 100 100)"
                  />
                </mask>
              </defs>
              <circle cx="100" cy="100" r="96" className="start-charge-ring-outer" />
              <circle cx="100" cy="100" r="87" className="start-charge-ring-detail" />
              <circle cx="100" cy="100" r="76" className="start-charge-ring-base" />
              <g className="start-charge-ring-lit">
                <g mask={`url(#${ringId})`}>
                  <circle cx="100" cy="100" r="76" className="start-charge-ring-fill" />
                </g>
              </g>
              <circle cx="100" cy="100" r="61" className="start-charge-ring-inner" />
            </svg>
            <ArrowRight />
          </span>
          <span className="start-charge-content">
            <small>
              <span>{state === 'complete' ? 'READY. LET’S MOVE!' : 'READY TO MOVE?'}</span>
              <span className="start-charge-shortcut">SHIFT + ENTER · QUICK START</span>
            </small>
            <strong>
              {state === 'complete' ? (
                <>
                  LET’S <em>GO!</em>
                </>
              ) : (
                <>
                  HOLD <em>ENTER</em> TO START
                </>
              )}
            </strong>
            <span className="start-charge-meter" aria-hidden="true">
              <span className="start-charge-aura">
                <span className="start-charge-fill">{cells}</span>
              </span>
              <span className="start-charge-track">
                <span className="start-charge-cells">{cells}</span>
                <span className="start-charge-fill">{cells}</span>
                <i className="start-charge-edge" />
              </span>
            </span>
          </span>
          <span className="start-charge-ignition" aria-hidden="true" />
          <span className="start-charge-backlight" aria-hidden="true" />
        </button>
        <span className="sr-only" id={`${titleId}-hold`}>
          按住 Enter 或鼠标约一秒充能开始，松开取消充能。Shift + Enter 快速开始。
        </span>
        <button className="briefing-cancel" type="button" onClick={cancel} aria-label="取消">
          <kbd>ESC</kbd>
          <span>/ BACK TO CANCEL</span>
          <i />
        </button>
      </section>
    </ModalBackdrop>
  );
}
