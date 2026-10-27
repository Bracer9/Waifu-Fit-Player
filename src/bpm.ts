/** Audio-only tempo analysis. No playback or chart timing is controlled here. */
import type { FirstBeatResult } from './first-beat';
export const ENVELOPE_RATE = 200;
export type BpmResult = { bpm: number; confidence: number };
export type TempoAnalysis =
  | { kind: 'stable'; result: BpmResult }
  | { kind: 'varying'; bpms: number[]; candidates: number[] }
  | { kind: 'unclear' };
export type DetectionCandidates = { kind: 'bpm' | 'first-beat'; values: number[] };
export type BpmRequest = {
  source: string;
  start: number;
  end: number;
  firstBeatBpm?: number;
  beatsPerBar?: 3 | 4;
};
export type BpmResponse =
  | { progress: number }
  | { result: BpmResult }
  | { firstBeat: FirstBeatResult }
  | { candidates: DetectionCandidates }
  | { error: string };

/** Keep only three short energy envelopes, rather than a whole decoded soundtrack. */
export class BpmEnvelope {
  private energy: Float32Array[];
  private counts: Uint32Array;
  private low: number[] = [];
  private mid: number[] = [];

  constructor(seconds: number) {
    const length = Math.ceil(seconds * ENVELOPE_RATE);
    this.energy = Array.from({ length: 3 }, () => new Float32Array(length));
    this.counts = new Uint32Array(length);
  }

  push(channels: Float32Array[], sampleRate: number, timestamp: number) {
    const lowAlpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate);
    const midAlpha = 1 - Math.exp((-2 * Math.PI * 2200) / sampleRate);
    for (let frame = 0; frame < channels[0].length; frame++) {
      const bin = Math.floor((timestamp + frame / sampleRate) * ENVELOPE_RATE);
      if (bin < 0 || bin >= this.counts.length) continue;
      for (let channel = 0; channel < channels.length; channel++) {
        const value = channels[channel][frame];
        const low = (this.low[channel] ?? 0) + lowAlpha * (value - (this.low[channel] ?? 0));
        const mid = (this.mid[channel] ?? 0) + midAlpha * (value - (this.mid[channel] ?? 0));
        this.low[channel] = low;
        this.mid[channel] = mid;
        // Sum channel energy: opposite-phase stereo must not cancel out the beat.
        this.energy[0][bin] += low * low;
        this.energy[1][bin] += (mid - low) ** 2;
        this.energy[2][bin] += (value - mid) ** 2;
      }
      this.counts[bin] += channels.length;
    }
  }

  onsets() {
    const result = new Float32Array(this.counts.length);
    const weights = [0.5, 0.35, 0.15];
    for (let band = 0; band < this.energy.length; band++) {
      const novelty = new Float32Array(result.length);
      let previous = 0,
        sum = 0;
      for (let i = 0; i < result.length; i++) {
        const level = Math.log1p(1000 * Math.sqrt(this.energy[band][i] / (this.counts[i] || 1)));
        novelty[i] = Math.max(0, level - previous);
        previous = level;
        sum += novelty[i];
      }
      if (sum < 0.01) continue;
      const scale = (weights[band] * result.length) / sum;
      for (let i = 0; i < result.length; i++) result[i] += novelty[i] * scale;
    }
    return result;
  }

  /** Relative audio activity for offline arrangement; never used as a calorie measurement. */
  levels() {
    return Float32Array.from(this.counts, (count, i) =>
      Math.sqrt(this.energy.reduce((sum, band) => sum + band[i], 0) / (count || 1)),
    );
  }
}

/** Normalized onset autocorrelation with beat multiples and a weak musical-tempo prior. */
export function estimateBpm(
  onsets: Float32Array,
  rate = ENVELOPE_RATE,
  referenceBpm?: number,
): BpmResult | null {
  if (onsets.length < rate * 6) return null;
  let mean = 0,
    maximum = 0;
  for (const value of onsets) {
    mean += value;
    maximum = Math.max(maximum, value);
  }
  mean /= onsets.length;
  if (!maximum || maximum < mean * 1.5) return null;
  let peaks = 0,
    lastPeak = -rate;
  for (let i = 1; i < onsets.length - 1; i++) {
    if (
      onsets[i] > Math.max(mean * 1.5, maximum * 0.08) &&
      onsets[i] >= onsets[i - 1] &&
      onsets[i] > onsets[i + 1] &&
      i - lastPeak > rate * 0.12
    ) {
      peaks++;
      lastPeak = i;
    }
  }
  if (peaks < 8) return null;

  // A short attack can land in adjacent 5 ms bins. Allow 10 ms of timing spread
  // before correlation, without lowering the confidence or nonrhythmic-noise gates.
  const radius = Math.max(1, Math.round(rate * 0.01));
  const centered = Float32Array.from(onsets, (_, index) => {
    let value = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      value += (onsets[index + offset] ?? mean) * (radius + 1 - Math.abs(offset));
    }
    return value / (radius + 1) ** 2 - mean;
  });
  const maxLag = Math.min(onsets.length - 1, Math.ceil((rate * 60 * 3) / 55) + 2);
  const correlation = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let dot = 0,
      left = 0,
      right = 0;
    for (let i = lag; i < centered.length; i++) {
      dot += centered[i] * centered[i - lag];
      left += centered[i] ** 2;
      right += centered[i - lag] ** 2;
    }
    correlation[lag] = dot / (Math.sqrt(left * right) || 1);
  }
  const at = (lag: number) => {
    const index = Math.round(lag);
    if (index < 1 || index >= correlation.length - 1) return 0;
    const offset = lag - index;
    const before = correlation[index - 1],
      center = correlation[index],
      after = correlation[index + 1];
    return Math.max(
      0,
      center + (offset * (after - before)) / 2 + (offset ** 2 * (before - 2 * center + after)) / 2,
    );
  };
  let bestScore = 0;
  const scores: number[] = [];
  const candidates: { bpm: number; score: number; correlation: number }[] = [];
  for (let step = 1100; step <= 4400; step++) {
    const bpm = step / 20;
    const lag = (rate * 60) / bpm;
    const fundamental = at(lag);
    // A half-time candidate also has strong beat multiples; its half-period penalty
    // prevents it winning solely because every other beat is accented.
    const prior = 0.85 + 0.15 * Math.exp(-((Math.log2(bpm / 128) / 0.8) ** 2) / 2);
    const score =
      (fundamental + 0.5 * at(lag * 2) + 0.25 * at(lag * 3) - 0.15 * at(lag / 2)) * prior;
    scores.push(score);
    candidates.push({ bpm, score, correlation: fundamental });
    bestScore = Math.max(bestScore, score);
  }
  scores.sort((a, b) => a - b);
  const prominence = bestScore - scores[Math.floor(scores.length / 2)];
  if (prominence < 0.2) return null;
  candidates.sort((a, b) => b.score - a.score);
  const distinct: typeof candidates = [];
  for (const candidate of candidates) {
    if (candidate.score < bestScore * 0.6) break;
    if (candidate.correlation < 0.18) continue;
    if (distinct.every((other) => Math.abs(Math.log(candidate.bpm / other.bpm)) > 0.025))
      distinct.push(candidate);
    if (distinct.length === 6) break;
  }
  // Repeated multi-beat patterns can beat the true tempo in autocorrelation.
  // Compare how distinctly each candidate supports ONE phase of a beat grid.
  const smooth = Float32Array.from(centered, (value) => Math.max(0, value + mean));
  const sorted = smooth.slice().sort();
  const cap = sorted[Math.floor(sorted.length * 0.98)];
  const ranked = distinct
    .map((candidate) => {
      const period = (rate * 60) / candidate.bpm;
      const phases: { phase: number; score: number }[] = [];
      for (let phase = 0; phase < period; phase += 0.5) {
        let sum = 0,
          count = 0;
        for (let time = phase; time < smooth.length; time += period) {
          const index = Math.floor(time),
            fraction = time - index;
          sum += Math.min(
            cap,
            (smooth[index] ?? 0) * (1 - fraction) + (smooth[index + 1] ?? 0) * fraction,
          );
          count++;
        }
        phases.push({ phase, score: sum / count });
      }
      phases.sort((a, b) => b.score - a.score);
      const best = phases[0];
      const runner = phases.find(({ phase }) => {
        const distance = Math.abs(phase - best.phase);
        return Math.min(distance, period - distance) > period * 0.15;
      });
      const clarity = best.score
        ? Math.max(0, (best.score - (runner?.score ?? 0)) / best.score)
        : 0;
      return {
        ...candidate,
        rankedScore: candidate.score * (0.8 + 0.2 * Math.min(1, clarity / 0.2)),
      };
    })
    .sort((a, b) => b.rankedScore - a.rankedScore);
  // A short window can favour an accent multiple. Retain the full-interval
  // candidate only when it also has comparable local evidence.
  const best =
    ranked.find(
      (candidate) =>
        referenceBpm !== undefined &&
        ranked[0].correlation < 0.75 &&
        Math.abs(Math.log(candidate.bpm / referenceBpm)) < 0.025 &&
        candidate.rankedScore >= ranked[0].rankedScore * 0.8,
    ) ?? ranked[0];
  if (!best) return null;
  return {
    bpm: Math.round(best.bpm * 100) / 100,
    confidence: Math.min(1, best.correlation),
  };
}

/** Detect disagreement within the sampled interval, without editing a tempo map. */
export function analyzeTempo(onsets: Float32Array, rate = ENVELOPE_RATE): TempoAnalysis {
  const result = estimateBpm(onsets, rate);
  const windows: BpmResult[] = [];
  const length = Math.round(rate * 12);
  for (let start = 0; start + rate * 8 <= onsets.length; start += length) {
    const local = estimateBpm(
      onsets.subarray(start, Math.min(start + length, onsets.length)),
      rate,
      result?.bpm,
    );
    if (local) windows.push(local);
  }
  const sameTempo = (a: number, b: number) => Math.abs(Math.log(a / b)) < 0.025;
  if (result) {
    const aligned = windows.filter((w) => sameTempo(w.bpm, result.bpm));
    const conflicts = windows.filter((w) => !sameTempo(w.bpm, result.bpm));
    // Weak windows can lock to alternating beats or triplet groupings. Accept
    // the complete interval only with independent local support; strong or
    // unrelated conflicts still go through the tempo-change check below.
    if (
      aligned.length >= 2 &&
      conflicts.every(
        (w) =>
          w.confidence < 0.45 &&
          [0.5, 2, 2 / 3, 3 / 2, 3 / 4, 4 / 3].some((ratio) =>
            sameTempo(w.bpm, result.bpm * ratio),
          ),
      )
    )
      return { kind: 'stable', result };
  }
  const groups: { bpm: number; members: BpmResult[] }[] = [];
  for (const result of windows) {
    // Local accents commonly switch half/double-time readings without the song
    // changing speed. Do not call that alone a detected tempo change.
    const group = groups.find((g) => {
      const octaves = Math.log2(g.bpm / result.bpm);
      if (Math.abs(octaves) < 0.055) return true;
      return (
        Math.abs(octaves - Math.round(octaves)) < 0.055 &&
        !(result.confidence >= 0.75 && g.members.some((r) => r.confidence >= 0.75))
      );
    });
    if (group)
      group.members.push({
        ...result,
        bpm: result.bpm * 2 ** Math.round(Math.log2(group.bpm / result.bpm)),
      });
    else groups.push({ bpm: result.bpm, members: [result] });
  }
  // Require repeated evidence, or a strongly periodic complete window, on both
  // sides. An unclear intro alone must not be reported as a tempo change.
  const supported = groups.filter(
    (g) => g.members.length >= 2 || g.members.some((r) => r.confidence >= 0.45),
  );
  if (supported.length > 1)
    return {
      kind: 'varying',
      // Preserve the uncollapsed full/local alternatives for a manual choice,
      // including half-time values that the consistency grouping normalizes.
      candidates: [...(result ? [result] : []), ...windows].reduce<number[]>((values, next) => {
        if (!values.some((value) => sameTempo(value, next.bpm))) values.push(next.bpm);
        return values;
      }, []),
      bpms: supported.map((g) =>
        Math.round(g.members.reduce((sum, r) => sum + r.bpm, 0) / g.members.length),
      ),
    };
  return result ? { kind: 'stable', result } : { kind: 'unclear' };
}
