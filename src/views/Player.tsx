import { Heart, Sparkles, Star } from 'lucide-react';
import { type Chart, LANES, noteColor, noteSymbol, noteAction } from '../model';
import { MediaController, useTime } from '../media';
import { noteX, specialAt } from '../timing';
import { NoteGlyph, LaneGlyph } from '../components/Glyph';
import { IMPACT_MS, NoteImpact } from '../components/NoteImpact';
import { specialVisualsAt } from '../special';
import { SpecialEffect } from '../components/SpecialEffect';
const PREVIEW_MS = 3600;
export function Player({
  chart,
  media,
  showGuide = false,
}: {
  chart: Chart;
  media: MediaController;
  showGuide?: boolean;
}) {
  const time = useTime(media);
  const special = specialAt(chart, time);
  const specialVisuals = specialVisualsAt(chart, time);
  const SpecialIcon =
    chart.specialMove?.icon === 'star'
      ? Star
      : chart.specialMove?.icon === 'sparkles'
        ? Sparkles
        : Heart;
  return (
    <section className="player-lanes" aria-label="跟练五轨">
      <div className="lane-heading" hidden={!showGuide}>
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
              (n.kind === 'hold' ? n.endTimeMs : n.timeMs + IMPACT_MS) >= time,
          );
          const holding = visible.find(
            (n) => n.kind === 'hold' && n.timeMs <= time && n.endTimeMs > time,
          );
          const hit = visible.filter((n) => time >= n.timeMs && time - n.timeMs < IMPACT_MS).at(-1);
          const release = chart.notes
            .filter(
              (n) =>
                n.lane === lane.id &&
                n.kind === 'hold' &&
                time >= n.endTimeMs &&
                time - n.endTimeMs < IMPACT_MS,
            )
            .at(-1);
          const releaseTime = release?.kind === 'hold' ? release.endTimeMs : -Infinity;
          const impact = hit && hit.timeMs >= releaseTime ? hit : release;
          const impactTime = impact === hit ? hit?.timeMs : releaseTime;
          const elapsed = impact && impactTime !== undefined ? time - impactTime : IMPACT_MS;
          const flash = 1 - elapsed / IMPACT_MS;
          const sway = holding?.kind === 'hold' && holding.modifier === 'sway';
          return (
            <div
              className={`play-lane ${holding ? 'is-holding' : ''} ${sway ? 'is-sway' : ''}`}
              style={
                {
                  '--lane': lane.color,
                  '--flash': flash,
                  '--impact-pulse': flash ** 2,
                } as React.CSSProperties
              }
              key={lane.id}
              data-lane={lane.id}
              data-testid={`lane-${lane.id}`}
            >
              <div className="lane-label">
                <LaneGlyph lane={lane.id} />
                <div>
                  <small hidden={!showGuide}>0{i + 1}</small>
                  <strong hidden={!showGuide}>{lane.english}</strong>
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
                      <div
                        className="player-note tap"
                        style={
                          {
                            left: `${head}%`,
                            '--lane': noteColor(note.lane, note.direction),
                          } as React.CSSProperties
                        }
                        key={note.id}
                        data-direction={note.direction}
                        aria-label={`${lane.name} ${noteSymbol(note.lane, note.direction, note.distance)}`}
                      >
                        <NoteGlyph
                          lane={note.lane}
                          direction={note.direction}
                          distance={note.distance}
                        />
                      </div>
                    ) : null;
                  const tail = noteX(note.endTimeMs, time, 88, PREVIEW_MS);
                  const right = Math.min(head, 88);
                  return (
                    <div
                      key={note.id}
                      className={`player-hold ${note.modifier === 'sway' ? 'sway' : ''} ${time >= note.timeMs ? 'active' : ''}`}
                      data-direction={note.direction}
                      aria-label={`${lane.name} ${noteSymbol(note.lane, note.direction, note.distance)} ${noteAction(note)}`}
                      style={
                        {
                          left: `${tail}%`,
                          width: `${Math.max(0, right - tail)}%`,
                          ...(note.lane === 'step'
                            ? { '--lane': noteColor(note.lane, note.direction) }
                            : {}),
                        } as React.CSSProperties
                      }
                    >
                      <span className="hold-caption">
                        {note.lane === 'step'
                          ? noteAction(note)
                          : note.modifier === 'sway'
                            ? '∿ SWAY ∿'
                            : 'HOLD'}
                      </span>
                      <div className="hold-head">
                        <NoteGlyph
                          lane={note.lane}
                          direction={note.direction}
                          distance={note.distance}
                        />
                      </div>
                    </div>
                  );
                })}
                <div
                  className={`hit-target ${holding ? 'holding' : ''}`}
                  data-testid={`target-${lane.id}`}
                  data-state={holding ? (sway ? 'sway' : 'holding') : 'idle'}
                  data-action={holding ? noteAction(holding) : undefined}
                  style={
                    holding?.lane === 'step'
                      ? ({
                          '--lane': noteColor(holding.lane, holding.direction),
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  {holding ? (
                    <NoteGlyph
                      lane={holding.lane}
                      direction={holding.direction}
                      distance={holding.distance}
                      size={29}
                    />
                  ) : (
                    <span />
                  )}
                </div>
                {impact && <NoteImpact note={impact} elapsed={elapsed} release={impact !== hit} />}
                {holding && (
                  <span className="holding-label">
                    {holding.lane === 'step' ? noteAction(holding) : sway ? 'SWAY' : '保持'}
                  </span>
                )}
                {release && (
                  <span className="release-label" style={{ opacity: flash }}>
                    {release.direction === 'close' &&
                    release.kind === 'hold' &&
                    release.modifier !== 'sway'
                      ? '并拢'
                      : '释放'}
                  </span>
                )}
                {chart.specialMove &&
                  specialVisuals.map((visual) => (
                    <SpecialEffect
                      key={visual.event.id}
                      visual={visual}
                      icon={chart.specialMove!.icon}
                      row={i}
                    />
                  ))}
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
        ) : showGuide ? (
          <>
            <span className="small-star">✳</span>
            <span>跟着节奏，自在地动起来。</span>
            <span className="tiny-label">YOUR BODY. YOUR BEAT.</span>
          </>
        ) : null}
      </div>
      <div className="lane-legend" hidden={!showGuide}>
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
