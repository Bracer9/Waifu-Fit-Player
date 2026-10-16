import { useId, useMemo } from 'react';
import { ribbonOutline } from '../ribbonGeometry';

/** A filled contour avoids overlapping SVG stroke edges under CSS perspective. */
export function HoldRibbon({
  durationMs,
  fullWidth,
  visibleFraction,
  size,
  headGap,
  joinedTail,
  gaps,
  sway,
}: {
  durationMs: number;
  fullWidth: number;
  visibleFraction: number;
  size: number;
  headGap: number;
  joinedTail: boolean;
  gaps: number[];
  sway: boolean;
}) {
  const mask = useId();
  const width = Math.max(1, fullWidth * visibleFraction);
  const height = size * 1.08;
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
      }),
    [durationMs, fullWidth, width, height, size, headGap, joinedTail, sway],
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
            <mask
              id={mask}
              maskUnits="userSpaceOnUse"
              x="-30"
              y="-30"
              width={width + 60}
              height={height + 60}
            >
              <rect x="-30" y="-30" width={width + 60} height={height + 60} fill="white" />
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
            <path className="ribbon-color" d={path} />
          </g>
        </svg>
      </span>
      {!joinedTail && <span className="hold-tail" aria-hidden="true" />}
    </>
  );
}
