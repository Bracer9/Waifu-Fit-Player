import { useMemo } from 'react';

/** The complete note owns its wave. Clip it at the judgement line without re-phasing it. */
export function HoldRibbon({
  durationMs,
  visibleFraction,
  sway,
}: {
  durationMs: number;
  visibleFraction: number;
  sway: boolean;
}) {
  const width = Math.max(1, durationMs / 10);
  const path = useMemo(() => {
    if (!sway) return `M 0 32 L ${width} 32`;
    const waves = Math.max(1, Math.round(durationMs / 1600));
    const half = width / (waves * 2);
    const amplitude = 16 * Math.min(1, durationMs / 800);
    let d = 'M 0 32';
    for (let i = 0; i < waves * 2; i++) {
      const start = i * half;
      const y = 32 + (i % 2 === 0 ? amplitude : -amplitude);
      d += ` C ${start + half / 3} ${y}, ${start + (half * 2) / 3} ${y}, ${start + half} 32`;
    }
    return d;
  }, [width, durationMs, sway]);
  return (
    <span className="hold-ribbon" aria-hidden="true">
      <svg
        viewBox={`0 0 ${width} 64`}
        preserveAspectRatio="none"
        style={{ width: `${100 / Math.max(visibleFraction, 0.0001)}%` }}
      >
        <path className="ribbon-bloom" d={path} vectorEffect="non-scaling-stroke" />
        <path className="ribbon-aura" d={path} vectorEffect="non-scaling-stroke" />
        <path className="ribbon-rim" d={path} vectorEffect="non-scaling-stroke" />
        <path className="ribbon-color" d={path} vectorEffect="non-scaling-stroke" />
        <path className="ribbon-light" d={path} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}
