import { useId, useMemo } from 'react';
import { ribbonOutline } from '../ribbonGeometry';
import { noteColor, type Note } from '../model';
import { noteGlyphShape, ShoePrint } from './Glyph';

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
  const shoeX = fullWidth / 2;
  // Notes are 1.25× larger; the shoe keeps its previous dimensions.
  const shoeSize = (size / 1.25) * 0.82;
  const showShoe =
    note.lane === 'step' &&
    sway &&
    (note.direction === 'left' || note.direction === 'right') &&
    shoeX > size * 0.65 &&
    shoeX < width - size * 0.75 &&
    !gaps.some((x) => Math.abs(x - shoeX) < size * 0.85);
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
            {showShoe && (note.direction === 'left' || note.direction === 'right') && (
              <g
                className="ribbon-slide-cue"
                transform={`translate(${shoeX - shoeSize / 2} ${(height - shoeSize) / 2}) scale(${shoeSize / 40})`}
              >
                <ShoePrint />
              </g>
            )}
          </g>
        </svg>
      </span>
      {!joinedTail && <span className="hold-tail" aria-hidden="true" />}
    </>
  );
}
