import { Flame, Pause, Play } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';
import { type Chart } from '../model';
import { MediaController, useTime } from '../media';
import { comboAt, createComboIndex } from '../combo';
import { caloriesAt, createCalorieIndex } from '../calories';
import { chartTimeAt } from '../timing';
import { CoverArt } from './CoverArt';
import { ratingValue } from '../chart-types';

export function PracticeStartupLighting({ finishing = false }: { finishing?: boolean }) {
  const [complete, setComplete] = useState(false);
  if (finishing && complete) return null;
  return (
    <div
      className={`studio-startup-lighting${finishing ? ' studio-finish-lighting' : ''}`}
      aria-hidden="true"
      onAnimationEnd={
        finishing
          ? (event) => {
              if (event.animationName === 'after-show-room-transition') setComplete(true);
            }
          : undefined
      }
    >
      <span className="ready-room-shade" />
      <span className="ready-lamp-cap" />
      <span className="ready-light-wash" />
      {!finishing && <span className="ready-room-focus" />}
    </div>
  );
}

export function PracticeBackdrop({ finished = false }: { finished?: boolean }) {
  return (
    <div className="practice-backdrop" aria-hidden="true">
      <img className="studio-scene" src="/art/studio-scene-v6.png?light=soft1" alt="" />
      {finished && <span className="studio-afterglow" />}
      <div className="studio-floor-print">
        <svg className="studio-floor-mark" viewBox="478 800 716 150" preserveAspectRatio="none">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M813 857v-9c0-23 46-23 46 0v9M813 847h9v17h-9zM850 847h9v17h-9z" />
            <path d="M478 887h187m342 0h187" strokeWidth="1" />
          </g>
          <text x="836" y="899" textAnchor="middle">
            WAIFU <tspan>FIT</tspan> PLAYER
          </text>
        </svg>
      </div>
    </div>
  );
}

function PracticeStats({ chart, media }: { chart: Chart; media: MediaController }) {
  const time = chartTimeAt(chart, useTime(media));
  const index = useMemo(() => createComboIndex(chart), [chart.notes, chart.tempoSegments]);
  const combo = comboAt(index, time);
  const calorieIndex = useMemo(() => createCalorieIndex(chart.notes), [chart.notes]);
  const calories = caloriesAt(calorieIndex, time).toFixed(1);
  return (
    <div className="practice-stats">
      <div
        className="calorie-stat"
        aria-label={`Estimated calories ${calories} kcal`}
        title="按谱面动作估算，仅供参考"
      >
        <Flame aria-hidden="true" />
        <div>
          <span className="stat-label">CALORIES</span>
          <strong>
            <span className="calorie-value" key={calories}>
              {calories}
            </span>{' '}
            <small>KCAL</small>
          </strong>
        </div>
      </div>
      <div className="combo-stat" aria-label={`Full combo ${combo}`}>
        <span className="stat-label">FULL COMBO</span>
        <strong>{String(combo).padStart(3, '0')}</strong>
      </div>
    </div>
  );
}

export function PracticeCover({ chart, media }: { chart: Chart; media: MediaController }) {
  return (
    <header className="practice-heading">
      <div className="practice-cover" aria-hidden="true">
        <span className="practice-panel-print" />
        <div className="cover-wordmark">
          <span>
            WAIFU <b>FIT</b> PLAYER
          </span>
        </div>
      </div>
      <PracticeStats chart={chart} media={media} />
    </header>
  );
}

export function PracticeMasthead({
  chart,
  cover,
  media,
  paused,
  finished = false,
  onPause,
  pauseTrigger,
  disabled,
}: {
  chart: Chart;
  cover: string;
  media: MediaController;
  paused: boolean;
  finished?: boolean;
  onPause: () => void;
  pauseTrigger: RefObject<HTMLButtonElement | null>;
  disabled: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <div className="practice-masthead">
      <span className="practice-panel-print" aria-hidden="true" />
      <div className="practice-song-cover">
        <CoverArt src={cover} eager />
      </div>
      <span className="track-status">{finished ? 'AFTER SHOW' : 'NOW PLAYING'}</span>
      <div className="practice-track-info">
        <h1 title={chart.title}>{chart.title}</h1>
      </div>
      <div className={`practice-chart-type ${chart.chartType ?? 'dance'}`} aria-label="谱面类型">
        <strong>{(chart.chartType ?? 'dance').toUpperCase()}</strong>
        <span>
          <small>{chart.chartType === 'fitness' ? 'INT.' : 'Lv.'}</small> {ratingValue(chart)}
        </span>
      </div>
      <PracticeBpm chart={chart} media={media} />
      <button
        ref={pauseTrigger}
        type="button"
        className={`practice-pause${pressed ? ' is-pressed' : ''}`}
        aria-label={paused ? '继续游戏' : '暂停游戏'}
        aria-expanded={paused}
        aria-controls="practice-pause-menu"
        title={paused ? '继续游戏（Esc / Backspace）' : '暂停游戏（Esc / Backspace）'}
        disabled={disabled}
        onClick={() => {
          setPressed(true);
          onPause();
        }}
        onAnimationEnd={() => setPressed(false)}
      >
        <span className="practice-pause-glyph" aria-hidden="true">
          {paused ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}
        </span>
        <span className="practice-pause-caption" aria-hidden="true">
          <b>{paused ? 'RESUME' : 'PAUSE'}</b>
          <small>ESC / BACK</small>
        </span>
      </button>
    </div>
  );
}

function PracticeBpm({ chart, media }: { chart: Chart; media: MediaController }) {
  const time = chartTimeAt(chart, useTime(media));
  const segments = useMemo(
    () => [...chart.tempoSegments].sort((a, b) => a.anchorMs - b.anchorMs),
    [chart.tempoSegments],
  );
  let bpm = segments[0]?.bpm;
  for (const segment of segments) {
    if (segment.anchorMs > time) break;
    bpm = segment.bpm;
  }
  return (
    <div className="practice-bpm">
      <small>BPM</small>
      <strong>{bpm ?? '—'}</strong>
    </div>
  );
}
