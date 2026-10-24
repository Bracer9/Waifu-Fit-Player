import type { MusicContext } from './context';

export type ContextExample = {
  song: string;
  brickId: string;
  family: string;
  beats: number;
  startMs: number;
  endMs: number;
  values: number[];
};
export type ContextModel = {
  version: number;
  featureVersion: number;
  means: number[];
  scales: number[];
  examples: ContextExample[];
};
/** Song-balanced nearest-neighbour evidence. No sample from an excluded song
 * participates in either normalization or classification during validation. */
export function fitContext(examples: ContextExample[]): ContextModel {
  const length = examples[0]?.values.length ?? 0;
  const means = Array.from(
    { length },
    (_, i) => examples.reduce((s, e) => s + e.values[i], 0) / (examples.length || 1),
  );
  const scales = means.map((mean, i) =>
    Math.max(
      0.08,
      Math.sqrt(
        examples.reduce((s, e) => s + (e.values[i] - mean) ** 2, 0) / (examples.length || 1),
      ),
    ),
  );
  return { version: 1, featureVersion: 1, means, scales, examples };
}
export function matchMovement(context: MusicContext, beats: number, model: ContextModel) {
  const dimensions = context.spectral ? context.values.length : 14;
  const ranked = model.examples
    .filter((e) => Math.max(e.beats, beats) / Math.min(e.beats, beats) <= 2)
    .map((e) => ({
      example: e,
      distance: Math.sqrt(
        context.values
          .slice(0, dimensions)
          .reduce((s, v, i) => s + ((v - e.values[i]) / model.scales[i]) ** 2, 0) / dimensions,
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  const neighbours: typeof ranked = [];
  const songCounts = new Map<string, number>();
  for (const candidate of ranked) {
    if ((songCounts.get(candidate.example.song) ?? 0) >= 3) continue;
    // Overlapping mining windows are not independent confirmations.
    if (
      neighbours.some(
        (n) =>
          n.example.song === candidate.example.song &&
          n.example.family === candidate.example.family &&
          Math.abs(n.example.startMs - candidate.example.startMs) < 4000,
      )
    )
      continue;
    neighbours.push(candidate);
    songCounts.set(candidate.example.song, (songCounts.get(candidate.example.song) ?? 0) + 1);
    if (neighbours.length === 9) break;
  }
  const families: Record<string, number> = {};
  const bricks: Record<string, number> = {};
  let total = 0;
  for (const n of neighbours) {
    const weight =
      Math.exp(-n.distance * 2) /
      ((n.distance + 0.05) ** 2 * (songCounts.get(n.example.song) ?? 1));
    families[n.example.family] = (families[n.example.family] ?? 0) + weight;
    bricks[n.example.brickId] = (bricks[n.example.brickId] ?? 0) + weight;
    total += weight;
  }
  for (const family of Object.keys(families)) families[family] /= total || 1;
  for (const id of Object.keys(bricks)) bricks[id] /= total || 1;
  const confidence = Math.max(0, ...Object.values(families));
  return {
    families,
    bricks,
    confidence,
    neighbours: neighbours.slice(0, 3).map((n) => ({
      song: n.example.song,
      startMs: n.example.startMs,
      endMs: n.example.endMs,
      family: n.example.family,
      distance: +n.distance.toFixed(3),
    })),
  };
}
