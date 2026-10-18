import { ArrowLeft, Flame } from 'lucide-react';
import { useMemo } from 'react';
import { type Chart } from '../model';
import { MediaController, useTime } from '../media';
import { comboAt, createComboIndex } from '../combo';
import { caloriesAt, createCalorieIndex } from '../calories';
import { chartTimeAt } from '../timing';

export function PracticeBackdrop() {
  return (
    <div className="practice-backdrop" aria-hidden="true">
      <img className="studio-scene" src="/art/studio-scene-v4.png" alt="" />
      <svg className="studio-wall-patterns" viewBox="0 0 1672 941" preserveAspectRatio="none">
        <polygon points="525,44 625,68 625,400 525,376" />
      </svg>
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
  title,
  onReturn,
  returnLabel = 'WORKBENCH',
}: {
  title: string;
  onReturn: () => void;
  returnLabel?: string;
}) {
  return (
    <div className="practice-masthead">
      <div className="practice-track-info">
        <div className="track-status">
          <span className="record-mark" aria-hidden="true">
            <i />
          </span>
          <span>NOW PLAYING</span>
        </div>
        <h1 title={title}>{title}</h1>
      </div>
      <button className="return-workspace" onClick={onReturn}>
        <ArrowLeft aria-hidden="true" strokeWidth={4} />
        <span>{returnLabel}</span>
      </button>
    </div>
  );
}
