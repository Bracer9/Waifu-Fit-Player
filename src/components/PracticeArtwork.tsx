import { ArrowLeft, Flame, Heart } from 'lucide-react';
import { useMemo } from 'react';
import { type Chart } from '../model';
import { MediaController, useTime } from '../media';
import { comboAt, createComboIndex } from '../combo';
import { chartTimeAt } from '../timing';

export function PracticeBackdrop() {
  return (
    <div className="practice-backdrop" aria-hidden="true">
      <img className="studio-scene" src="/art/studio-scene-v3.png" alt="" />
    </div>
  );
}

export function PracticeForeground() {
  return (
    <div className="practice-foreground" aria-hidden="true">
      <div className="mat-lettering mat-lettering-pink">
        Sweat
        <br />
        <span>Beats</span>
        <br />
        <span>Smiles ♡</span>
      </div>
      <div className="mat-lettering mat-lettering-dark">
        BETTER
        <br />
        STRONGER
        <br />
        CUTER ♡
      </div>
    </div>
  );
}

function PracticeStats({ chart, media }: { chart: Chart; media: MediaController }) {
  const time = chartTimeAt(chart, useTime(media));
  const index = useMemo(() => createComboIndex(chart), [chart.notes, chart.tempoSegments]);
  const combo = comboAt(index, time);
  return (
    <div className="practice-stats">
      <div className="calorie-stat" aria-label="Calories calculation coming soon">
        <Flame aria-hidden="true" />
        <div>
          <span className="stat-label">CALORIES</span>
          <strong>
            — <small>KCAL</small>
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

export function PracticeMasthead({ title, onReturn }: { title: string; onReturn: () => void }) {
  return (
    <div className="practice-masthead">
      <div className="move-lettering" aria-hidden="true">
        Let's
        <br />
        <span>Move!</span>
        <Heart />
      </div>
      <div className="practice-track-info">
        <span className="record-mark" aria-hidden="true">
          <i />
        </span>
        <span className="track-status">NOW PLAYING</span>
        <h1 title={title}>{title}</h1>
      </div>
      <button className="return-workspace" onClick={onReturn}>
        <ArrowLeft size={15} /> WORKBENCH
      </button>
    </div>
  );
}
