import type { MusicSpectrumData } from './spectrum';
import { meanLevel } from './music';

export const CONTEXT_VERSION = 1;
export type MusicContext = { values: number[]; spectral: boolean };
/** Features use the requested interval and adjacent bars, not track IDs,
 * absolute song position, chart labels or another draft's movements. */
export function musicContext(
  onsets: Float32Array,
  levels: Float32Array,
  spectrum: MusicSpectrumData | undefined,
  startMs: number,
  endMs: number,
  beatMs: number,
  rate: number,
): MusicContext {
  const average = meanLevel(levels, startMs, endMs, rate),
    duration = endMs - startMs;
  const quantiles = Array.from(levels)
    .filter((_, i) => i % 20 === 0)
    .sort((a, b) => a - b);
  const median = quantiles[Math.floor(quantiles.length / 2)] ?? 1;
  const peak = Math.max(average, 1e-6);
  const values = [
    Math.log1p(average / (median || 1e-6)),
    Math.log(
      (meanLevel(levels, startMs, startMs + duration / 2, rate) + 1e-6) /
        (meanLevel(levels, startMs + duration / 2, endMs, rate) + 1e-6),
    ),
    Math.log((average + 1e-6) / (meanLevel(levels, startMs - 4 * beatMs, startMs, rate) + 1e-6)),
    Math.log((meanLevel(levels, endMs, endMs + 4 * beatMs, rate) + 1e-6) / (average + 1e-6)),
  ];
  // Beat phase averages (not rescaled 64-cell envelopes): straight/half-time,
  // syncopation and onset density remain distinct from volume.
  const phase = Array(8).fill(0) as number[],
    counts = Array(8).fill(0) as number[];
  let variation = 0,
    attack = 0;
  for (
    let i = Math.max(0, Math.floor((startMs * rate) / 1000));
    i < Math.min(levels.length, Math.ceil((endMs * rate) / 1000));
    i++
  ) {
    const p = Math.floor(((((i / rate) * 1000 - startMs) / beatMs) % 1) * 8);
    phase[p] += onsets[i];
    counts[p]++;
    attack += onsets[i];
    variation += (levels[i] - average) ** 2;
  }
  const norm = phase.reduce((s, v) => s + v, 0) || 1;
  values.push(
    Math.log1p(attack / (duration / 1000 || 1)),
    Math.sqrt(variation / ((duration * rate) / 1000 || 1)) / peak,
    ...phase.map((v, i) => (v / norm) * 8 * (counts[i] ? 1 : 0)),
  );
  const frames =
    spectrum?.frames.slice(
      Math.max(0, Math.floor((startMs / 1000) * spectrum.rate)),
      Math.ceil((endMs / 1000) * spectrum.rate),
    ) ?? [];
  const means = Array(24).fill(0) as number[],
    deviations = Array(24).fill(0) as number[];
  for (const frame of frames)
    for (let i = 0; i < 24; i++) means[i] += (frame[i] ?? 0) / (frames.length || 1);
  for (const frame of frames)
    for (let i = 0; i < 24; i++)
      deviations[i] += ((frame[i] ?? 0) - means[i]) ** 2 / (frames.length || 1);
  // Chroma entropy and timbre variability are useful; raw absolute pitches
  // are omitted to avoid classifying exercise by musical key.
  const chroma = means.slice(12),
    total = chroma.reduce((s, v) => s + v, 0) || 1;
  const entropy =
    -chroma.reduce((s, v) => {
      const p = v / total;
      return s + (p ? p * Math.log(p) : 0);
    }, 0) / Math.log(12);
  values.push(
    ...means.slice(0, 12),
    ...deviations.slice(0, 12).map(Math.sqrt),
    entropy,
    ...deviations.slice(12).map(Math.sqrt),
  );
  return {
    values: values.map((v) => (Number.isFinite(v) ? Math.max(-8, Math.min(8, v)) : 0)),
    spectral: frames.length > 0,
  };
}
