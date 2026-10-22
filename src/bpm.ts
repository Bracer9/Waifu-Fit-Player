/** Audio-only tempo analysis. No playback or chart timing is controlled here. */
export const ENVELOPE_RATE = 200;
export type BpmResult = { bpm: number; confidence: number };
export type BpmRequest = { source: string; start: number; end: number };
export type BpmResponse = { progress: number } | { result: BpmResult } | { error: string };

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
}

/** Normalized onset autocorrelation with beat multiples and a weak musical-tempo prior. */
export function estimateBpm(onsets: Float32Array, rate = ENVELOPE_RATE): BpmResult | null {
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
  let bestBpm = 0,
    bestScore = 0,
    bestCorrelation = 0;
  const scores: number[] = [];
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
    if (score > bestScore) {
      bestBpm = bpm;
      bestScore = score;
      bestCorrelation = fundamental;
    }
  }
  scores.sort((a, b) => a - b);
  const prominence = bestScore - scores[Math.floor(scores.length / 2)];
  if (bestCorrelation < 0.18 || prominence < 0.2) return null;
  return {
    bpm: Math.round(bestBpm * 100) / 100,
    confidence: Math.min(1, bestCorrelation),
  };
}
