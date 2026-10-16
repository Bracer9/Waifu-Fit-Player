import { useId, useMemo } from 'react';
import { ribbonOutline } from '../ribbonGeometry';
import type { Note } from '../model';
import { noteGlyphShape } from './Glyph';

/** A filled contour avoids overlapping SVG stroke edges under CSS perspective. */
export function HoldRibbon({
  durationMs,
  fullWidth,
  visibleFraction,
  size,
  note,
  headOpacity,
  joinedTail,
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
  const path = useMemo(
    () =>
      ribbonOutline({
        durationMs,
        fullWidth,
        visibleWidth: width,
        height,
        bandWidth: size * 0.32,
        headGap,
        tailGap: joinedTail ? size * 0.5 : 0,
        sway,
        connected,
      }),
    [durationMs, fullWidth, width, height, size, headGap, joinedTail, sway, connected],
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
            </g>
          </g>
        </svg>
      </span>
      {!joinedTail && <span className="hold-tail" aria-hidden="true" />}
    </>
  );
}
