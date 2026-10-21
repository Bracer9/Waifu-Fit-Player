import { useId, useMemo } from 'react';
import { ribbonOutline } from '../ribbonGeometry';
import { isFollowStep, noteColor } from '../model';
import {
  GlyphLabel,
  noteGlyphShape,
  PalmPrint,
  PunchPair,
  ReachPair,
  ShoePrint,
  SquatDownCue,
} from './Glyph';
import type { DisplayNote } from '../armDisplay';

const GLOW_LAYERS = [
  [22, 0.025],
  [16, 0.045],
  [12, 0.08],
  [8, 0.16],
] as const;

/** A filled contour avoids overlapping SVG stroke edges under CSS perspective. */
export function HoldRibbon({
  durationMs,
  fullWidth,
  visibleFraction,
  offscreenWidth,
  size,
  note,
  headOpacity,
  joinedTail,
  releaseNote,
  sway,
}: {
  durationMs: number;
  fullWidth: number;
  visibleFraction: number;
  offscreenWidth: number;
  size: number;
  note: DisplayNote;
  headOpacity: number;
  joinedTail: boolean;
  releaseNote?: Extract<DisplayNote, { kind: 'tap' }>;
  sway: boolean;
}) {
  const outline = useId();
  const cueClip = useId();
  const width = Math.max(1, fullWidth * visibleFraction);
  // Keep one marker of overscan for the glow. A long hold must not allocate an
  // SVG/filter surface or rebuild curve segments for its entire offscreen tail.
  // Snap to the original 6 px sampling grid to preserve the wave's exact phase.
  const visibleStart = Math.floor(Math.max(0, offscreenWidth - size) / 6) * 6;
  const drawWidth = Math.max(1, width - visibleStart);
  const height = size * 1.08;
  const connected = headOpacity > 0;
  // Keep both the free-sway loop and the separate FOLLOW arrow's hollow stem clear.
  const follow = isFollowStep(note);
  const headGap = connected ? (note.direction === 'free' || follow ? size * 0.4 : 0) : size * 0.32;
  const glyph = noteGlyphShape(note.lane, note.direction, note.distance, note.armAction, note.hand);
  const releaseGlyph = releaseNote
    ? noteGlyphShape(
        releaseNote.lane,
        releaseNote.direction,
        releaseNote.distance,
        releaseNote.armAction,
        releaseNote.hand,
      )
    : undefined;
  // Keep this cue attached to the original midpoint, like the ribbon's wave phase.
  const cueX = fullWidth / 2;
  // The wide squat arrowhead needs more horizontal presence than hand/foot cues.
  const cueSize = note.lane === 'squat' ? size * 0.9 : (size / 1.25) * 0.82;
  const showCue =
    ((note.lane === 'squat' && !sway) ||
      ((note.lane === 'step' || note.lane === 'punch') &&
        sway &&
        (note.lane === 'punch' || note.direction === 'left' || note.direction === 'right'))) &&
    cueX > size * 0.75;
  const path = useMemo(
    () =>
      ribbonOutline({
        durationMs,
        fullWidth,
        visibleWidth: width,
        height,
        bandWidth: size * 0.32,
        headGap,
        sway,
        connected,
        visibleStart,
      }),
    [durationMs, fullWidth, width, height, size, headGap, sway, connected, visibleStart],
  );
  return (
    <>
      <span
        className="hold-ribbon"
        aria-hidden="true"
        style={{ left: visibleStart, width: drawWidth, right: 'auto' }}
      >
        <svg
          viewBox={`${visibleStart} 0 ${drawWidth} ${height}`}
          preserveAspectRatio="none"
          data-full-width={fullWidth}
          data-visible-fraction={visibleFraction}
        >
          <defs>
            {showCue && (
              <clipPath id={cueClip} clipPathUnits="userSpaceOnUse">
                <rect
                  x={visibleStart - size}
                  y={-size}
                  width={drawWidth + size}
                  height={height + size * 2}
                />
              </clipPath>
            )}
            <filter
              id={outline}
              filterUnits="userSpaceOnUse"
              x={visibleStart - size}
              y={-size}
              width={drawWidth + size * 2}
              height={height + size * 2}
              colorInterpolationFilters="sRGB"
            >
              <feMorphology in="SourceAlpha" operator="dilate" radius="0.85" result="edge" />
              <feFlood floodColor="#faffff" />
              <feComposite in2="edge" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g>
            {/* Approximate the soft halo with translucent vector contours.
                Live blur on a moving/clipped SVG path can stall Chrome's GPU
                during first-use filter setup, even after image decoding. */}
            <path className="ribbon-bloom" d={path} />
            {GLOW_LAYERS.map(([strokeWidth, opacity]) => (
              <path
                key={strokeWidth}
                className="ribbon-glow"
                d={path}
                style={{ strokeWidth, opacity }}
              />
            ))}
            <path className="ribbon-aura" d={path} />
            <g className="ribbon-outline" filter={`url(#${outline})`}>
              <path className="ribbon-color" d={path} />
              {connected && !follow && (
                <g
                  className="ribbon-head-shape"
                  opacity={headOpacity}
                  transform={`translate(${width - size / 2} ${(height - size) / 2}) scale(${size / 40})`}
                >
                  {note.armAction === 'forward' && note.hand === 'both' ? (
                    <PunchPair palms ribbon />
                  ) : note.pairedReach ? (
                    <ReachPair ribbon />
                  ) : note.pairedPunch ? (
                    <PunchPair ribbon />
                  ) : (
                    <>
                      <path
                        d={glyph.path}
                        fillRule="evenodd"
                        transform={
                          glyph.mirror
                            ? 'translate(40 0) scale(-1 1)'
                            : `rotate(${glyph.angle} 20 20)`
                        }
                      />
                      <GlyphLabel
                        lane={note.lane}
                        direction={note.direction}
                        armAction={note.armAction}
                        hand={note.hand}
                      />
                    </>
                  )}
                </g>
              )}
              {releaseNote && releaseGlyph && (
                <g
                  className="ribbon-release-shape"
                  transform={`translate(${-size / 2} ${(height - size) / 2}) scale(${size / 40})`}
                  style={
                    {
                      '--lane': releaseNote.pairedReach
                        ? 'var(--arms-both)'
                        : noteColor(
                            releaseNote.lane,
                            releaseNote.direction,
                            releaseNote.hand,
                            releaseNote.armAction,
                            releaseNote.foot,
                          ),
                    } as React.CSSProperties
                  }
                >
                  {releaseNote.armAction === 'forward' && releaseNote.hand === 'both' ? (
                    <PunchPair palms ribbon />
                  ) : releaseNote.pairedReach ? (
                    <ReachPair ribbon />
                  ) : releaseNote.pairedPunch ? (
                    <PunchPair ribbon />
                  ) : (
                    <>
                      <path
                        d={releaseGlyph.path}
                        fillRule="evenodd"
                        transform={
                          releaseGlyph.mirror
                            ? 'translate(40 0) scale(-1 1)'
                            : `rotate(${releaseGlyph.angle} 20 20)`
                        }
                      />
                      <GlyphLabel
                        lane={releaseNote.lane}
                        direction={releaseNote.direction}
                        armAction={releaseNote.armAction}
                        hand={releaseNote.hand}
                      />
                    </>
                  )}
                </g>
              )}
            </g>
          </g>
          {/* Consume the cue at the judgment line along with the ribbon. */}
          {showCue && (
            <g clipPath={`url(#${cueClip})`}>
              <g
                className="ribbon-slide-cue"
                transform={`translate(${cueX - cueSize / 2} ${(height - cueSize) / 2}) scale(${cueSize / 40})`}
              >
                {note.lane === 'squat' ? (
                  <SquatDownCue />
                ) : note.lane === 'punch' ? (
                  <PalmPrint />
                ) : (
                  <ShoePrint />
                )}
              </g>
            </g>
          )}
        </svg>
      </span>
      {!joinedTail && <span className="hold-tail" aria-hidden="true" />}
    </>
  );
}
