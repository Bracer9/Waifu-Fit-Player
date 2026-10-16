/** All positions refer to the original note, so clipping never stretches its wave. */
export function waveOffset(durationMs: number, fraction: number, height: number): number {
  const waves = Math.max(1, Math.round(durationMs / 1600));
  return Math.sin(fraction * waves * 2 * Math.PI) * height * 0.26 * Math.min(1, durationMs / 800);
}

type Point = [number, number];
function smooth(points: Point[]): string {
  let path = '';
  const n = (value: number) => Number(value.toFixed(2));
  for (let i = 1; i < points.length; i++) {
    const previous = points[Math.max(0, i - 2)];
    const a = points[i - 1];
    const b = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    path += ` C ${n(a[0] + (b[0] - previous[0]) / 6)} ${n(a[1] + (b[1] - previous[1]) / 6)}, ${n(b[0] - (next[0] - a[0]) / 6)} ${n(b[1] - (next[1] - a[1]) / 6)}, ${n(b[0])} ${n(b[1])}`;
  }
  return path;
}

export function ribbonOutline({
  durationMs,
  fullWidth,
  visibleWidth,
  height,
  bandWidth,
  headGap,
  tailGap,
  sway,
}: {
  durationMs: number;
  fullWidth: number;
  visibleWidth: number;
  height: number;
  bandWidth: number;
  headGap: number;
  tailGap: number;
  sway: boolean;
}): string {
  const start = tailGap;
  const end = Math.max(start, visibleWidth - headGap);
  if (end - start < 1) return '';
  const taper = Math.min(bandWidth * 1.4, (end - start) * 0.4);
  const top: Point[] = [];
  const bottom: Point[] = [];
  const xs = [start];
  for (let x = Math.ceil((start + 1) / 6) * 6; x < end; x += 6) xs.push(x);
  xs.push(end);
  for (const x of xs) {
    const phase = Math.min(1, (end - x) / Math.max(1, taper * 2));
    const blend = phase * phase * (3 - 2 * phase);
    const center = height / 2 + (sway ? waveOffset(durationMs, x / fullWidth, height) * blend : 0);
    const tip = Math.min(1, (end - x) / taper);
    const half = (bandWidth / 2) * tip * (2 - tip);
    top.push([x, center - half]);
    bottom.push([x, center + half]);
  }
  bottom.reverse();
  return `M ${top[0][0]} ${top[0][1]}${smooth(top)}${smooth(bottom)} Z`;
}
