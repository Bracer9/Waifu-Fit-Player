import { ENVELOPE_RATE } from './bpm';
import type { Chart, TempoSegment } from './model';
import { videoTimeAt } from './timing';
import { estimateBarPattern, type BarPatternEvidence, type BarPatternResult } from './bar-pattern';

/** confidence is a heuristic evidence score, not probability of a correct bar start. */
export type FirstBeatResult = {
  timeMs: number;
  confidence: number;
  pattern?: BarPatternResult;
  rhythmRepeat?: { beats: number; similarity: number };
};
export type FirstBeatAnalysis =
  | { kind: 'candidate'; result: FirstBeatResult }
  | {
      kind: 'ambiguous-origin';
      candidatesMs: number[];
      reason: 'window-disagreement' | 'isolated-opening';
    }
  | { kind: 'unclear' };

/** A strong periodic phase does not establish the first bar. In particular,
 * a quiet opening/SE followed by louder music can move the first thresholded
 * attack by several beats when the observation length changes. Check prefixes
 * of the SAME decoded envelope before allowing the editor to write an anchor.
 * This is a rejection gate, not a semantic downbeat/SE classifier.
 */
export function analyzeFirstBeat(
  onsets: Float32Array,
  bpm: number,
  rate = ENVELOPE_RATE,
  evidence?: BarPatternEvidence,
): FirstBeatAnalysis {
  const result = estimateBeatAttack(onsets, bpm, rate);
  if (!result) return { kind: 'unclear' };
  if (evidence) {
    const pattern = estimateBarPattern(onsets, bpm, result.timeMs, evidence, rate);
    if (pattern)
      return {
        kind: 'candidate',
        result: { timeMs: pattern.timeMs, confidence: pattern.confidence, pattern },
      };
  }
  const period = (rate * 60) / bpm;
  const attackNear = (bin: number) => {
    let peak = 0;
    for (
      let i = Math.max(0, Math.floor(bin - rate * 0.015));
      i <= Math.min(onsets.length - 1, Math.ceil(bin + rate * 0.1));
      i++
    )
      peak = Math.max(peak, onsets[i]);
    return peak;
  };
  const origin = (result.timeMs * rate) / 1000;
  const nearby = Array.from({ length: 12 }, (_, i) => attackNear(origin + (i + 1) * period));
  const local = nearby.slice().sort((a, b) => a - b)[Math.floor(nearby.length / 2)];
  // An SE can accidentally sit on the later song's grid. Four attacks ANYWHERE
  // in the next twelve beats do not make that isolated opening a musical start.
  const immediatelySupported = nearby
    .slice(0, 4)
    .filter((v) => v > Math.max(1e-6, local * 0.35)).length;
  if (immediatelySupported < 2)
    return { kind: 'ambiguous-origin', candidatesMs: [result.timeMs], reason: 'isolated-opening' };
  const candidates = [result];
  for (const seconds of [8, 16, 30]) {
    if (onsets.length <= seconds * rate + rate) continue;
    const prefix = estimateBeatAttack(onsets.subarray(0, Math.round(seconds * rate)), bpm, rate);
    if (prefix) candidates.push(prefix);
  }
  const times = candidates.map((c) => c.timeMs);
  // Compare absolute origins, not just phase modulo a beat: a whole-bar shift
  // would otherwise appear to be perfect agreement.
  if (Math.max(...times) - Math.min(...times) > (60000 / bpm) * 0.5) {
    const first = Math.min(...times),
      beatMs = 60000 / bpm,
      meter = evidence?.beatsPerBar ?? 4;
    const samePhase = times.every(
      (t) => Math.abs((t - first) / beatMs - Math.round((t - first) / beatMs)) < 0.12,
    );
    const repeat = samePhase ? openingRhythmRepeat(onsets, first, bpm, meter, rate) : null;
    // Quiet, genuinely repeated openings can fall below a later section's
    // threshold. Restore their earliest occurrence only when whole rhythmic
    // shapes agree across three groups, not merely one coincident attack.
    if (repeat !== null)
      return {
        kind: 'candidate',
        result: {
          timeMs: first,
          confidence: Math.min(0.85, result.confidence),
          rhythmRepeat: { beats: meter, similarity: repeat },
        },
      };
    return {
      kind: 'ambiguous-origin',
      candidatesMs: [...new Set(times)].sort((a, b) => a - b),
      reason: 'window-disagreement',
    };
  }
  return { kind: 'candidate', result };
}

function openingRhythmRepeat(
  onsets: Float32Array,
  originMs: number,
  bpm: number,
  meter: number,
  rate: number,
) {
  const beat = (rate * 60) / bpm,
    origin = (originMs * rate) / 1000,
    cells = meter * 16;
  if (origin + meter * beat * 3 > onsets.length) return null;
  const shapes = Array.from({ length: 3 }, (_, group) => {
    const v = Array.from({ length: cells }, (_, cell) => {
      let maximum = 0;
      const from = Math.floor(origin + group * meter * beat + (cell * beat) / 16),
        to = Math.ceil(origin + group * meter * beat + ((cell + 1) * beat) / 16);
      for (let i = from; i < to; i++) maximum = Math.max(maximum, onsets[i]);
      return maximum;
    });
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    return v.map((x) => x - mean);
  });
  const similarity = (a: number[], b: number[]) =>
    a.reduce((s, x, i) => s + x * b[i], 0) /
    (Math.sqrt(a.reduce((s, x) => s + x * x, 0) * b.reduce((s, x) => s + x * x, 0)) || 1);
  const score = Math.min(
    similarity(shapes[0], shapes[1]),
    similarity(shapes[0], shapes[2]),
    similarity(shapes[1], shapes[2]),
  );
  return score > 0.82 ? score : null;
}

/** Search before a possibly wrong anchor without crossing neighbouring segments. */
export function firstBeatWindow(chart: Chart, segment: TempoSegment, durationMs: number) {
  const previous = Math.max(
    ...chart.tempoSegments.filter((s) => s.anchorMs < segment.anchorMs).map((s) => s.anchorMs),
  );
  const next = Math.min(
    ...chart.tempoSegments.filter((s) => s.anchorMs > segment.anchorMs).map((s) => s.anchorMs),
  );
  const start = Math.max(
    chart.playRange?.startMs ?? 0,
    videoTimeAt(chart, previous + 1),
    Number.isFinite(previous)
      ? videoTimeAt(chart, segment.anchorMs - (4 * 60000) / segment.bpm)
      : 0,
    videoTimeAt(chart, 0),
  );
  return {
    start: Math.max(0, start) / 1000,
    end:
      Math.min(durationMs, chart.playRange?.endMs ?? Infinity, videoTimeAt(chart, next - 1)) / 1000,
  };
}

/** A candidate beat-grid origin, not a claim about a song's musical downbeat. */
export function estimateFirstBeat(
  onsets: Float32Array,
  bpm: number,
  rate = ENVELOPE_RATE,
  evidence?: BarPatternEvidence,
): FirstBeatResult | null {
  const analysis = analyzeFirstBeat(onsets, bpm, rate, evidence);
  return analysis.kind === 'candidate' ? analysis.result : null;
}

/** Raw thresholded attack estimate. Never apply it without the origin checks. */
function estimateBeatAttack(
  onsets: Float32Array,
  bpm: number,
  rate = ENVELOPE_RATE,
): FirstBeatResult | null {
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300 || onsets.length < rate * 6) return null;
  const values = Float32Array.from(
    onsets,
    (_, i) =>
      ((onsets[i - 2] ?? 0) +
        2 * (onsets[i - 1] ?? 0) +
        3 * onsets[i] +
        2 * (onsets[i + 1] ?? 0) +
        (onsets[i + 2] ?? 0)) /
      9,
  );
  const sorted = values.slice().sort();
  const cap = sorted[Math.floor(sorted.length * 0.98)];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!cap || !mean) return null;
  const period = (rate * 60) / bpm;
  const sample = (time: number) => {
    const index = Math.floor(time),
      fraction = time - index;
    return (values[index] ?? 0) * (1 - fraction) + (values[index + 1] ?? 0) * fraction;
  };
  const scores: { phase: number; score: number }[] = [];
  for (let phase = 0; phase < period; phase += 0.25) {
    let score = 0,
      count = 0;
    for (let time = phase; time < values.length; time += period) {
      // One loud intro impact must not outweigh a consistent rhythmic grid.
      score += Math.min(cap, sample(time));
      count++;
    }
    scores.push({ phase, score: score / count });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const runner =
    scores.find(({ phase }) => {
      const distance = Math.abs(phase - best.phase);
      return Math.min(distance, period - distance) > period * 0.15;
    })?.score ?? 0;
  const prominence = (best.score - runner) / best.score;
  if (best.score < mean * 1.3 || prominence < 0.04) return null;

  const radius = Math.max(1, Math.round(Math.min(rate * 0.03, period * 0.08)));
  const peaks: { index: number; value: number }[] = [];
  for (let time = best.phase; time < values.length; time += period) {
    let index = Math.round(time);
    for (
      let i = Math.max(0, index - radius);
      i <= Math.min(values.length - 1, Math.round(time) + radius);
      i++
    ) {
      if (values[i] > (values[index] ?? 0)) index = i;
    }
    peaks.push({ index, value: values[index] ?? 0 });
  }
  const threshold = Math.max(mean * 1.4, best.score * 0.55);
  const first = peaks.find(
    (peak, index) =>
      peak.value >= threshold &&
      peaks.slice(index, index + 12).filter((next) => next.value >= mean * 1.15).length >= 4,
  );
  if (!first) return null;
  const confidence = Math.min(1, (best.score / mean - 1) * 2) * Math.min(1, prominence / 0.2);
  if (confidence < 0.3) return null;
  // Return the start of the attack rather than its later energy peak.
  let edge = first.index;
  const limit = Math.max(0, edge - Math.round(rate * 0.08));
  while (edge > limit && values[edge - 1] < values[edge]) edge--;
  return {
    timeMs: Math.round((edge * 1000) / rate),
    confidence,
  };
}
