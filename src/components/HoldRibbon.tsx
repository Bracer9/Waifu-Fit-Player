import { useId, useMemo } from 'react';
import { ribbonOutline } from '../ribbonGeometry';
import { noteColor, type Note } from '../model';
import { noteGlyphShape, PalmPrint, ShoePrint } from './Glyph';

/** A filled contour avoids overlapping SVG stroke edges under CSS perspective. */
export function HoldRibbon({
  durationMs,
  fullWidth,
  visibleFraction,
  size,
  note,
  headOpacity,
  joinedTail,
  releaseNote,
  gaps,
  sway,
}: {
  durationMs: number;
  fullWidth: number;
  visibleFraction: number;
  size: number;
  note: Note;
  headOpacity: number;
  joinedTail: boolean;
  releaseNote?: Extract<Note, { kind: 'tap' }>;
  gaps: number[];
  sway: boolean;
}) {
  const mask = useId();
  const outline = useId();
  const cueClip = useId();
  const width = Math.max(1, fullWidth * visibleFraction);
  const height = size * 1.08;
  const connected = headOpacity > 0;
  // Meet the left junction of the free-sway loop without filling its open centres.
  const headGap = connected ? (note.direction === 'free' ? size * 0.4 : 0) : size * 0.32;
  const glyph = noteGlyphShape(note.lane, note.direction, note.distance);
  const releaseGlyph = releaseNote
    ? noteGlyphShape(releaseNote.lane, releaseNote.direction, releaseNote.distance)
    : undefined;
  const tailGap = joinedTail && !releaseNote ? size * 0.5 : 0;
  // Keep this cue attached to the original midpoint, like the ribbon's wave phase.
  const cueX = fullWidth / 2;
  // Match the original shoe dimensions for both hand and foot cues.
  const cueSize = (size / 1.25) * 0.82;
  const showCue =
    (note.lane === 'step' || note.lane === 'punch') &&
    sway &&
    (note.direction === 'left' || note.direction === 'right') &&
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
        tailGap,
        sway,
        connected,
      }),
    [durationMs, fullWidth, width, height, size, headGap, tailGap, sway, connected],
  );
  return (
    <>
      <span className="hold-ribbon" aria-hidden="true">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          data-full-width={fullWidth}
          data-visible-fraction={visibleFraction}
        >
          <defs>
            {showCue && (
              <clipPath id={cueClip} clipPathUnits="userSpaceOnUse">
                <rect x={-size} y={-size} width={width + size} height={height + size * 2} />
              </clipPath>
            )}
            <filter
              id={outline}
              filterUnits="userSpaceOnUse"
              x={-size}
              y={-size}
              width={width + size * 2}
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
            <mask
              id={mask}
              maskUnits="userSpaceOnUse"
              x={-size}
              y={-size}
              width={width + size * 2}
              height={height + size * 2}
            >
              <rect
                x={-size}
                y={-size}
                width={width + size * 2}
                height={height + size * 2}
                fill="white"
              />
              {gaps.map((x, index) => (
                <ellipse
                  key={index}
                  cx={x}
                  cy={height / 2}
                  rx={size * 0.53}
                  ry={size * 0.6}
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <g mask={`url(#${mask})`}>
            <path className="ribbon-bloom" d={path} />
            <path className="ribbon-aura" d={path} />
            <g className="ribbon-outline" filter={`url(#${outline})`}>
              <path className="ribbon-color" d={path} />
              {connected && (
                <g
                  className="ribbon-head-shape"
                  opacity={headOpacity}
                  transform={`translate(${width - size / 2} ${(height - size) / 2}) scale(${size / 40})`}
                >
                  <path
                    d={glyph.path}
                    fillRule="evenodd"
                    transform={`rotate(${glyph.angle} 20 20)`}
                  />
                </g>
              )}
              {releaseNote && releaseGlyph && (
                <g
                  className="ribbon-release-shape"
                  transform={`translate(${-size / 2} ${(height - size) / 2}) scale(${size / 40})`}
                  style={
                    {
                      '--lane': noteColor(releaseNote.lane, releaseNote.direction),
                    } as React.CSSProperties
                  }
                >
                  <path
                    d={releaseGlyph.path}
                    fillRule="evenodd"
                    transform={`rotate(${releaseGlyph.angle} 20 20)`}
                  />
                </g>
              )}
            </g>
          </g>
          {/* Clip at the judgment line as the ribbon is consumed, without hiding
              the entire cue early or cutting it with another note's gap mask. */}
          {showCue && (
            <g clipPath={`url(#${cueClip})`}>
              <g
                className="ribbon-slide-cue"
                transform={`translate(${cueX - cueSize / 2} ${(height - cueSize) / 2}) scale(${cueSize / 40})`}
              >
                {note.lane === 'punch' ? <PalmPrint /> : <ShoePrint />}
              </g>
            </g>
          )}
        </svg>
      </span>
      {!joinedTail && <span className="hold-tail" aria-hidden="true" />}
    </>
  );
}
