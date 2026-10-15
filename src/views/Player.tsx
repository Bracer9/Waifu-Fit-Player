import { Heart, Sparkles, Star } from 'lucide-react';
import { type Chart, LANES } from '../model';
import { MediaController, useTime } from '../media';
import { noteX, specialAt } from '../timing';
import { DirectionGlyph, LaneGlyph } from '../components/Glyph';
const PREVIEW_MS = 3600;
export function Player({ chart, media }: { chart: Chart; media: MediaController }) {
  const time = useTime(media);
  const special = specialAt(chart, time);
  const SpecialIcon =
    chart.specialMove?.icon === 'star'
      ? Star
      : chart.specialMove?.icon === 'sparkles'
        ? Sparkles
        : Heart;
  return (
    <section className="player-lanes" aria-label="跟练四轨">
      <div className="lane-heading">
        <span className="eyebrow">FOLLOW THE RHYTHM</span>
        <span className="direction-hint">
          动作提示 <span>→</span>
        </span>
      </div>
      <div className="lanes-stack">
        {LANES.map((lane, i) => {
          const visible = chart.notes.filter(
            (n) =>
              n.lane === lane.id &&
              n.timeMs <= time + PREVIEW_MS + 300 &&
              (n.kind === 'hold' ? n.endTimeMs : n.timeMs + 300) >= time,
          );
          const holding = visible.find(
            (n) => n.kind === 'hold' && n.timeMs <= time && n.endTimeMs > time,
          );
          const hit = visible.find((n) => time >= n.timeMs && time - n.timeMs < 260);
          const release = chart.notes.find(
            (n) =>
              n.lane === lane.id &&
              n.kind === 'hold' &&
              time >= n.endTimeMs &&
              time - n.endTimeMs < 260,
          );
          const flash = hit
            ? 1 - (time - hit.timeMs) / 260
            : release?.kind === 'hold'
              ? 1 - (time - release.endTimeMs) / 260
              : 0;
          const sway = holding?.kind === 'hold' && holding.modifier === 'sway';
          return (
            <div
              className={`play-lane ${holding ? 'is-holding' : ''} ${sway ? 'is-sway' : ''}`}
              style={{ '--lane': lane.color, '--flash': flash } as React.CSSProperties}
              key={lane.id}
              data-testid={`lane-${lane.id}`}
            >
              <div className="lane-label">
                <LaneGlyph lane={lane.id} />
                <div>
                  <small>0{i + 1}</small>
                  <strong>{lane.english}</strong>
                  <span>{lane.name}</span>
                </div>
              </div>
              <div className="note-highway">
                <div className="highway-line" />
                <div className="highway-grid" />
                {visible.map((note) => {
                  const head = noteX(note.timeMs, time, 88, PREVIEW_MS);
                  if (note.kind === 'tap')
                    return time < note.timeMs ? (
                      <div className="player-note tap" style={{ left: `${head}%` }} key={note.id}>
                        <DirectionGlyph direction={note.direction} />
                      </div>
                    ) : null;
                  const tail = noteX(note.endTimeMs, time, 88, PREVIEW_MS);
                  const right = Math.min(head, 88);
                  return (
                    <div
                      key={note.id}
                      className={`player-hold ${note.modifier === 'sway' ? 'sway' : ''} ${time >= note.timeMs ? 'active' : ''}`}
                      style={{ left: `${tail}%`, width: `${Math.max(0, right - tail)}%` }}
                    >
                      <span className="hold-caption">
                        {note.modifier === 'sway' ? '∿ SWAY ∿' : 'HOLD'}
                      </span>
                      <div className="hold-head">
                        <DirectionGlyph direction={note.direction} />
                      </div>
                    </div>
                  );
                })}
                <div
                  className={`hit-target ${holding ? 'holding' : ''}`}
                  data-testid={`target-${lane.id}`}
                  data-state={holding ? (sway ? 'sway' : 'holding') : 'idle'}
                >
                  {holding ? <DirectionGlyph direction={holding.direction} size={29} /> : <span />}
                </div>
                <div
                  className="hit-flash"
                  style={{
                    opacity: flash,
                    transform: `translate(-50%,-50%) scale(${1 + (1 - flash) * 0.45})`,
                  }}
                />
                {holding && <span className="holding-label">{sway ? 'SWAY' : '保持'}</span>}
                {release && (
                  <span className="release-label" style={{ opacity: flash }}>
                    释放
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className={`special-slot ${special ? 'visible' : ''} ${special?.active ? 'active' : ''}`}
        aria-live="off"
        data-testid="special-cue"
      >
        {special && chart.specialMove ? (
          <>
            <SpecialIcon size={29} fill={special.active ? 'currentColor' : 'none'} />
            <div>
              <small>{special.active ? 'SPECIAL! / 就是现在' : 'GET READY / 准备招牌动作'}</small>
              <strong>{chart.specialMove.name}</strong>
            </div>
            <span className="special-count">
              {special.active ? '✦' : Math.max(1, Math.ceil((special.event.timeMs - time) / 1000))}
            </span>
            <div className="special-progress" style={{ width: `${special.progress * 100}%` }} />
          </>
        ) : (
          <>
            <span className="small-star">✳</span>
            <span>跟着节奏，自在地动起来。</span>
            <span className="tiny-label">YOUR BODY. YOUR BEAT.</span>
          </>
        )}
      </div>
      <div className="lane-legend">
        <span>
          <i className="legend-tap" />
          方向提示
        </span>
        <span>
          <i className="legend-hold" />
          保持 HOLD
        </span>
        <span>
          <i className="legend-sway" />
          保持并摇摆 SWAY
        </span>
      </div>
    </section>
  );
}
