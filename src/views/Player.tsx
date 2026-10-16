import { Heart, Sparkles, Star } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type Chart,
  type Note,
  LANES,
  noteColor,
  noteSymbol,
  noteAction,
  specialMoveLabel,
} from '../model';
import { MediaController, useTime } from '../media';
import { noteX, specialAt } from '../timing';
import { NoteGlyph, LaneGlyph } from '../components/Glyph';
import { IMPACT_MS, NoteImpact } from '../components/NoteImpact';
import { specialVisualsAt } from '../special';
import { SpecialEffect } from '../components/SpecialEffect';
import { HoldRibbon } from '../components/HoldRibbon';
import { createBeatMap, sustainPulseAt } from '../combo';
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
  const tracks = useRef<HTMLElement>(null);
  const [metrics, setMetrics] = useState({ width: 600, marker: 52 });
  useLayoutEffect(() => {
    const root = tracks.current!;
    const highway = root.querySelector<HTMLElement>('.note-highway')!;
    const probe = root.querySelector<HTMLElement>('.note-metrics')!;
    const observer = new ResizeObserver(() => {
      const next = {
        width: highway.clientWidth,
        marker: probe.offsetWidth,
      };
      setMetrics((previous) =>
        Object.keys(next).every(
          (key) => next[key as keyof typeof next] === previous[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    });
    observer.observe(highway);
    observer.observe(probe);
    return () => observer.disconnect();
  }, []);
  const joinedTails = useMemo(
    () =>
      new Set(
        chart.notes
          .filter(
            (note) =>
              note.kind === 'hold' &&
              chart.notes.some(
                (next) =>
                  next.id !== note.id && next.lane === note.lane && next.timeMs === note.endTimeMs,
              ),
          )
          .map((note) => note.id),
      ),
    [chart.notes],
  );
  const noteStyle = (note: Note): React.CSSProperties => {
    return {
      '--lane': noteColor(note.lane, note.direction),
    } as React.CSSProperties;
  };
  const beats = useMemo(() => createBeatMap(chart.tempoSegments), [chart.tempoSegments]);
  const special = specialAt(chart, time);
  const specialVisuals = specialVisualsAt(chart, time);
  const SpecialIcon =
    chart.specialMove?.icon === 'star'
      ? Star
      : chart.specialMove?.icon === 'sparkles'
        ? Sparkles
        : Heart;
  return (
    <section
      ref={tracks}
      className={`player-lanes ${showGuide ? 'preview-lanes' : ''}`}
      aria-label="Movement tracks"
    >
      <span className="note-metrics" aria-hidden="true" />
      <div className="lane-heading" hidden={!showGuide}>
        <span className="eyebrow">FOLLOW THE RHYTHM</span>
        <span className="direction-hint">
          MOVE <span>→</span>
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
          const holdings = visible.filter(
            (n) => n.kind === 'hold' && n.timeMs <= time && n.endTimeMs > time,
          );
          const holding = holdings.at(-1);
          const nextHeadDistance = Math.min(
            ...visible
              .filter((note) => note.timeMs > time)
              .map((note) => ((note.timeMs - time) / PREVIEW_MS) * 0.88 * metrics.width),
          );
          // Give the incoming action visual priority before its marker touches the old cue.
          const cueOpacity = Math.min(
            1,
            Math.max(0, (nextHeadDistance / metrics.marker - 0.85) / 0.3),
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
          const sustainPulse = sustainPulseAt(holding, time, beats);
          return (
            <div
              className={`play-lane ${holding ? 'is-holding' : ''} ${sway ? 'is-sway' : ''}`}
              style={
                {
                  '--lane': lane.color,
                  '--track-surface': `color-mix(in srgb, ${lane.color} 18%, #191a22)`,
                  '--flash': flash,
                  '--impact-pulse': flash ** 2,
                  '--sustain-pulse': sustainPulse,
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
                  <strong>{lane.english}</strong>
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
                            ...noteStyle(note),
                          } as React.CSSProperties
                        }
                        key={note.id}
                        data-direction={note.direction}
                        data-note-id={note.id}
                        aria-label={`${lane.english} ${noteSymbol(note.lane, note.direction, note.distance)}`}
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
                  const remainingPx = (Math.max(0, right - tail) * metrics.width) / 100;
                  const gaps = visible
                    .filter((other) => other.id !== note.id && other.timeMs > time)
                    .map(
                      (other) =>
                        ((noteX(other.timeMs, time, 88, PREVIEW_MS) - tail) * metrics.width) / 100,
                    )
                    .filter((x) => x > -metrics.marker && x < remainingPx + metrics.marker);
                  const hideTail =
                    joinedTails.has(note.id) ||
                    gaps.some((x) => Math.abs(x) < metrics.marker * 0.65);
                  return (
                    <div
                      key={note.id}
                      className={`player-hold ${note.modifier === 'sway' ? 'sway' : ''} ${time >= note.timeMs ? 'active' : ''}`}
                      data-direction={note.direction}
                      data-note-id={note.id}
                      aria-label={`${lane.english} ${noteSymbol(note.lane, note.direction, note.distance)} ${noteAction(note)}`}
                      style={
                        {
                          left: `${tail}%`,
                          width: `${Math.max(0, right - tail)}%`,
                          ...noteStyle(note),
                          '--tail-opacity': Math.min(
                            1,
                            Math.max(0, (remainingPx / metrics.marker - 0.5) / 0.45),
                          ),
                        } as React.CSSProperties
                      }
                    >
                      {!showGuide && (
                        <HoldRibbon
                          durationMs={note.endTimeMs - note.timeMs}
                          fullWidth={
                            ((note.endTimeMs - note.timeMs) * metrics.width * 0.88) / PREVIEW_MS
                          }
                          visibleFraction={Math.max(0, right - tail) / (head - tail)}
                          size={metrics.marker}
                          note={note}
                          headOpacity={
                            time < note.timeMs ? 1 : holding?.id === note.id ? cueOpacity : 0
                          }
                          joinedTail={hideTail}
                          gaps={gaps}
                          sway={note.modifier === 'sway'}
                        />
                      )}
                      <span className="hold-caption">{noteAction(note)}</span>
                      <div className="hold-head">
                        <NoteGlyph
                          variant="tip"
                          joined={!showGuide}
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
                  data-direction={holding?.direction}
                  aria-label={
                    holding
                      ? `${lane.english} ${noteSymbol(holding.lane, holding.direction, holding.distance)} ${noteAction(holding)}`
                      : `${lane.english} target`
                  }
                  style={{ opacity: cueOpacity, ...(holding ? noteStyle(holding) : {}) }}
                >
                  {holding ? (
                    <span
                      className="holding-cue"
                      data-note-id={holding.id}
                      data-direction={holding.direction}
                      style={noteStyle(holding)}
                    >
                      <NoteGlyph
                        variant="tip"
                        joined={!showGuide}
                        lane={holding.lane}
                        direction={holding.direction}
                        distance={holding.distance}
                        size={29}
                      />
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
                {impact && <NoteImpact note={impact} elapsed={elapsed} release={impact !== hit} />}
                {holding && (
                  <span className="holding-label" style={{ opacity: cueOpacity }}>
                    {noteAction(holding)}
                  </span>
                )}
                {release && !holding && (
                  <span className="release-label" style={{ opacity: flash }}>
                    {release.direction === 'close' &&
                    release.kind === 'hold' &&
                    release.modifier !== 'sway'
                      ? 'CLOSED'
                      : 'RELEASE'}
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
        {!showGuide && <div className="judgement-line" aria-hidden="true" />}
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
              <small>{special.active ? 'SPECIAL!' : 'GET READY'}</small>
              <strong>{specialMoveLabel(chart.specialMove)}</strong>
            </div>
            <span className="special-count">
              {special.active ? '✦' : Math.max(1, Math.ceil((special.event.timeMs - time) / 1000))}
            </span>
            <div className="special-progress" style={{ width: `${special.progress * 100}%` }} />
          </>
        ) : showGuide ? (
          <>
            <span className="small-star">✳</span>
            <span>FIND YOUR RHYTHM.</span>
            <span className="tiny-label">YOUR BODY. YOUR BEAT.</span>
          </>
        ) : null}
      </div>
      <div className="lane-legend" hidden={!showGuide}>
        <span>
          <i className="legend-tap" />
          TAP
        </span>
        <span>
          <i className="legend-hold" />
          HOLD
        </span>
        <span>
          <i className="legend-sway" />
          SWAY
        </span>
      </div>
    </section>
  );
}
