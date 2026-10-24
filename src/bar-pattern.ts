import type { MusicSpectrumData } from './fitness/spectrum';

export type BarPatternEvidence = {
  spectrum: MusicSpectrumData;
  beatsPerBar?: 3 | 4;
};
export type BarPatternResult = {
  timeMs: number;
  confidence: number;
  patternBeats: number;
  similarity: number;
  contrast: number;
  supportingWindows: number;
  edgeSnapMs: number;
};
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const cosine = (a: number[], b: number[]) =>
  a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0) /
  (Math.sqrt(a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0)) || 1);
function trimmed(values: number[]) {
  const v = values.slice().sort((a, b) => a - b),
    n = Math.floor(v.length * 0.1);
  return mean(v.slice(n, v.length - n));
}

/** Fixed-tempo, repeating bar-pattern hypothesis, not an SE/vocal classifier.
 * Repeated spectral sequences establish musical recurrence. Recurrent harmonic
 * attacks distinguish bar starts from a louder snare/voice on another beat.
 * The opening is excluded from training these votes, so one SE cannot win.
 */
export function estimateBarPattern(
  onsets: Float32Array,
  bpm: number,
  attackMs: number,
  evidence: BarPatternEvidence,
  rate = 200,
): BarPatternResult | null {
  const spectrum = evidence.spectrum,
    meter = evidence.beatsPerBar ?? 4;
  const period = 60 / bpm,
    bar = period * meter,
    duration = onsets.length / rate;
  if (duration < 24 || spectrum.frames.length / spectrum.rate < duration - 0.5) return null;
  const phase = (((attackMs / 1000) % period) + period) % period;
  const descriptor = (start: number, end: number) => {
    const frames = spectrum.frames.slice(
      Math.max(0, Math.floor(start * spectrum.rate)),
      Math.ceil(end * spectrum.rate),
    );
    return Array.from({ length: 24 }, (_, i) => mean(frames.map((f) => f[i] ?? 0)));
  };
  const beats: { t: number; k: number; change: number; features: number[] }[] = [];
  for (let k = 0, t = phase; t < duration - period; t += period, k++) {
    const before = descriptor(t - period * 0.7, t - period * 0.1).slice(12);
    const after = descriptor(t + period * 0.1, t + period * 0.7).slice(12);
    beats.push({
      t,
      k,
      change: 1 - cosine(before, after),
      features: descriptor(t + period * 0.2, t + period * 0.8),
    });
  }
  const opening = Math.max(4, bar * 2);
  const valid = beats.filter((b) => b.t >= opening);
  const scores = Array.from({ length: meter }, (_, i) =>
    trimmed(valid.filter((b) => b.k % meter === i).map((b) => b.change)),
  );
  const ranked = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
  const best = ranked[0],
    contrast = (best.score - ranked[1].score) / (best.score || 1);
  if (best.score < 0.025 || contrast < 0.12) return null;
  // At least two independent passages must support the same bar position.
  const votes = [];
  for (let start = opening; start + 12 <= duration; start += 12) {
    const group = Array.from({ length: meter }, (_, i) =>
      trimmed(
        valid
          .filter((b) => b.t >= start && b.t < start + 12 && b.k % meter === i)
          .map((b) => b.change),
      ),
    );
    const winner = group.indexOf(Math.max(...group));
    votes.push(winner);
  }
  const supportingWindows = votes.filter((v) => v === best.index).length;
  if (supportingWindows < 2 || supportingWindows < votes.length * 0.5) return null;
  function repeatSimilarity(lag: number) {
    const pairs = [];
    for (let i = meter * 2; i + lag * 2 < beats.length; i += meter) {
      const a = beats.slice(i, i + lag).flatMap((b) => b.features),
        b = beats.slice(i + lag, i + lag * 2).flatMap((b) => b.features);
      pairs.push(cosine(a, b));
    }
    return { lag, similarity: trimmed(pairs), pairs: pairs.length };
  }
  const recurrence = [1, 2, 4, 8]
    .map((n) => {
      const current = repeatSimilarity(meter * n);
      const neighbours = mean([
        repeatSimilarity(current.lag - 1).similarity,
        repeatSimilarity(current.lag + 1).similarity,
      ]);
      return { ...current, advantage: current.similarity - neighbours };
    })
    .filter((r) => r.pairs >= 3 && r.similarity > 0.75 && r.advantage > 0.008)
    .sort((a, b) => b.advantage - a.advantage)[0];
  if (!recurrence) return null;
  let origin = phase + best.index * period,
    edgeSnapMs = 0;
  // A near-zero negative boundary can arise when an MP4 starts just after the
  // attack. Preserve the nonnegative chart schema, report the clipped residual.
  if (bar - origin <= 0.08) {
    edgeSnapMs = Math.round((bar - origin) * 1000);
    origin = 0;
  } else {
    // Pick the earliest audible occurrence of this recurring BAR position,
    // not an isolated maximum on any one of its constituent beats.
    const peak = (s: number, e: number) => {
      let v = 0;
      for (
        let i = Math.max(0, Math.floor(s * rate));
        i < Math.min(onsets.length, Math.ceil(e * rate));
        i++
      )
        v = Math.max(v, onsets[i]);
      return v;
    };
    const support = beats
      .filter((b) => b.k % meter === best.index && b.t >= opening)
      .map((b) => peak(b.t - 0.015, b.t + 0.1));
    const threshold = trimmed(support) * 0.25;
    const openingSupported = (start: number) => {
      const following = Array.from({ length: 12 }, (_, i) =>
        peak(start + (i + 1) * period - 0.015, start + (i + 1) * period + 0.1),
      );
      const typical = following.slice().sort((a, b) => a - b)[6];
      if (following.slice(0, 4).filter((v) => v > Math.max(1e-6, typical * 0.35)).length < 2)
        return false;
      const shape = (at: number) => {
        const cells = meter * 16,
          v = Array.from({ length: cells }, (_, i) =>
            peak(at + (i * period) / 16, at + ((i + 1) * period) / 16),
          );
        const average = mean(v);
        return v.map((x) => x - average);
      };
      const first = shape(start);
      return (
        Math.max(cosine(first, shape(start + bar)), cosine(first, shape(start + bar * 2))) > 0.3
      );
    };
    while (
      origin < Math.min(12, duration - bar) &&
      (peak(origin - 0.015, origin + 0.1) < threshold || !openingSupported(origin))
    )
      origin += bar;
    if (origin >= Math.min(12, duration - bar)) return null;
  }
  return {
    timeMs: Math.round(origin * 1000),
    confidence: Math.min(0.95, 0.5 + contrast * 0.5),
    patternBeats: recurrence.lag,
    similarity: recurrence.similarity,
    contrast,
    supportingWindows,
    edgeSnapMs,
  };
}
