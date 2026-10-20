export type LiquidPoint = { x: number; y: number };

export const LIQUID_TRANSITION = {
  coverMs: 880,
  revealMs: 1380,
  coveredMs: 200,
  introHoldMs: 620,
  waveHeight: 0.016,
  printOpacity: 0.13,
  highlightOpacity: 0.58,
  arrivalPulseMs: 180,
  drainEnd: 0.6,
  cornerReturnStart: 0.54,
  cornerClearance: 0.06,
} as const;

export function easeBetween(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function easeOutBetween(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return 1 - (1 - t) ** 3;
}

/** Read all four corners, including the live music transform and settings scale. */
export function cornerQuad(node: HTMLElement): LiquidPoint[] {
  const style = getComputedStyle(node);
  const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
  const shift = style.translate === 'none' ? [0, 0] : style.translate.split(' ').map(parseFloat);
  const scale = style.scale === 'none' ? [1] : style.scale.split(' ').map(Number);
  const matrix = new DOMMatrix()
    .translate(shift[0], shift[1] ?? 0)
    .scale(scale[0], scale[1] ?? scale[0])
    .multiply(new DOMMatrix(style.transform));
  return [
    [0, 0],
    [node.offsetWidth, 0],
    [node.offsetWidth, node.offsetHeight],
    [0, node.offsetHeight],
  ].map(([x, y]) => {
    const point = matrix.transformPoint(new DOMPoint(x - ox, y - oy));
    return { x: node.offsetLeft + ox + point.x, y: node.offsetTop + oy + point.y };
  });
}

/** The visible lower envelope of a top-corner polygon, continued outside its bounds. */
export function surfaceAt(quad: LiquidPoint[], x: number) {
  const edges = quad.flatMap((a, i) => {
    const b = quad[(i + 1) % quad.length];
    if (Math.abs(a.x - b.x) < 0.001) return [];
    return [{ a, b, slope: (b.y - a.y) / (b.x - a.x) }];
  });
  const min = Math.min(...quad.map((p) => p.x));
  const max = Math.max(...quad.map((p) => p.x));
  const inside = Math.max(min, Math.min(max, x));
  const crossing = edges.filter(
    ({ a, b }) => inside >= Math.min(a.x, b.x) - 0.001 && inside <= Math.max(a.x, b.x) + 0.001,
  );
  if (x < min || x > max) {
    const slopes = crossing.map((edge) => edge.slope);
    const slope = x < min ? Math.max(...slopes) : Math.min(...slopes);
    const y = Math.max(...crossing.map(({ a, slope }) => a.y + (inside - a.x) * slope));
    return y + (x - inside) * slope;
  }
  return Math.max(...crossing.map(({ a, slope }) => a.y + (x - a.x) * slope));
}

/** Cover starts at the corner; retreat stays a full-width wave until it is offscreen. */
export function liquidSurface(
  quad: LiquidPoint[],
  width: number,
  height: number,
  phase: 'cover' | 'reveal',
  progress: number,
) {
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const spread = easeBetween(0, 0.38, progress);
  const rise = easeBetween(0.26, 1, progress);
  const drain = easeBetween(0, LIQUID_TRANSITION.drainEnd, progress);
  const rounding = phase === 'cover' ? spread : 1;
  const activity = Math.sin(Math.PI * progress);
  const xs = [
    ...new Set([
      ...Array.from({ length: 25 }, (_, i) => (width * i) / 24),
      ...(phase === 'cover' ? quad.map((p) => p.x).filter((x) => x > 0 && x < width) : []),
    ]),
  ].sort((a, b) => a - b);
  const band = height * 0.16;
  const points = xs.map((x) => {
    const full = height * 1.12;
    const level =
      phase === 'cover'
        ? mix(mix(surfaceAt(quad, x), band, spread), full, rise)
        : mix(full, -height * 0.12, drain);
    const clock = (phase === 'cover' ? progress : progress + 1) * 5;
    const wave =
      Math.sin((x / width) * Math.PI * 2.4 + clock) +
      0.32 * Math.sin((x / width) * Math.PI * 5.4 - clock * 1.3);
    return { x, y: level + wave * height * LIQUID_TRANSITION.waveHeight * activity };
  });
  // Trace right to left; the top and side closures always extend beyond the viewport.
  const reversed = [...points].reverse();
  let path = `M -2 ${-height * 3} H ${width + 2} L ${reversed[0].x} ${reversed[0].y}`;
  let edge = `M ${reversed[0].x} ${reversed[0].y}`;
  for (let i = 0; i < reversed.length - 1; i++) {
    const a = reversed[i],
      b = reversed[i + 1];
    const prev = reversed[Math.max(0, i - 1)],
      next = reversed[Math.min(reversed.length - 1, i + 2)];
    // Corner vertices make sample spacing uneven. Use slopes in x-space so
    // the smooth wave cannot fold back on itself around a closely spaced pair.
    const third = (b.x - a.x) / 3;
    const x1 = a.x + third;
    const y1 = mix(
      a.y + (b.y - a.y) / 3,
      a.y + (third * (b.y - prev.y)) / (b.x - prev.x),
      rounding,
    );
    const x2 = b.x - third;
    const y2 = mix(
      b.y - (b.y - a.y) / 3,
      b.y - (third * (next.y - a.y)) / (next.x - a.x),
      rounding,
    );
    const segment = ` C ${x1} ${y1} ${x2} ${y2} ${b.x} ${b.y}`;
    path += segment;
    edge += segment;
  }
  return { path: `${path} Z`, edge, activity };
}
