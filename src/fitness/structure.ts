import { meanLevel, musicSimilarity, phraseFingerprint } from './music';

export type PhraseBoundary = {
  beat: number;
  strength: number;
  reason: 'opening' | 'change' | 'phrase' | 'end';
};
/** Centered before/after evidence: a change is placed at its beginning, not
 * after the new phrase has already filled a detection window. */
export function planFitnessPhrases(
  onsets: Float32Array,
  levels: Float32Array,
  anchorMs: number,
  beatMs: number,
  endBeat: number,
  rate: number,
): PhraseBoundary[] {
  const bars = Math.floor(endBeat / 4),
    barMs = beatMs * 4;
  const scores = Array.from({ length: bars + 1 }, () => 0);
  for (let bar = 2; bar + 2 <= bars; bar++) {
    const t = anchorMs + bar * barMs;
    const left = phraseFingerprint(onsets, levels, t - 2 * barMs, t, rate),
      right = phraseFingerprint(onsets, levels, t, t + 2 * barMs, rate);
    const a = meanLevel(levels, t - 2 * barMs, t, rate),
      b = meanLevel(levels, t, t + 2 * barMs, rate);
    const levelContrast = Math.abs(Math.log((b + 1e-6) / (a + 1e-6)));
    scores[bar] = Math.max(
      0.65 * (1 - musicSimilarity(left, right)) + 0.35 * Math.min(1, levelContrast),
      // Only an unusually large dynamic change can stand alone as evidence.
      0.85 * Math.min(1, levelContrast / Math.log(8)),
    );
  }
  const energies = Array.from({ length: bars }, (_, bar) =>
    meanLevel(levels, anchorMs + bar * barMs, anchorMs + (bar + 1) * barMs, rate),
  );
  const median = energies.slice().sort((a, b) => a - b)[Math.floor(energies.length / 2)] ?? 0;
  // No unconditional two-bar delay. Look for a short intro giving way to
  // sustained music; quiet music alone must not postpone the first movement.
  let start = 0;
  while (start + 1 < bars && energies[start] < median * 0.005) start++;
  const attacks = energies.map((_, bar) =>
    meanLevel(onsets, anchorMs + bar * barMs, anchorMs + (bar + 1) * barMs, rate),
  );
  const average = (values: number[]) =>
    values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
  for (let bar = start + 1; bar <= Math.min(start + 4, bars - 2); bar++) {
    const before = average(energies.slice(start, bar)),
      after = Math.min(...energies.slice(bar, bar + 2));
    const attackBefore = average(attacks.slice(start, bar)),
      attackAfter = Math.min(...attacks.slice(bar, bar + 2));
    if (after > before * 2.2 || (attackAfter > attackBefore * 1.5 && after > before * 0.95)) {
      start = bar;
      break;
    }
  }
  const sustainedContrast = (bar: number) => {
    const before = energies.slice(bar - 2, bar),
      after = energies.slice(bar, bar + 2);
    if (before.length !== 2 || after.length !== 2) return 1;
    return Math.max(
      (Math.min(...after) + 1e-6) / (Math.max(...before) + 1e-6),
      (Math.min(...before) + 1e-6) / (Math.max(...after) + 1e-6),
    );
  };
  const boundaries: PhraseBoundary[] = [{ beat: start * 4, strength: 1, reason: 'opening' }];
  while (start + 1 < bars) {
    const expected = Math.min(bars, start + 8);
    const candidates = [];
    for (let i = start + 3; i <= Math.min(bars - 2, expected + 2); i++)
      if (
        scores[i] >= 0.72 &&
        // A fill or a short drop is not evidence for a new seven/nine-bar phrase.
        ((i - start) % 4 === 0 ? sustainedContrast(i) >= 1.5 : sustainedContrast(i) >= 4) &&
        scores[i] >= (scores[i - 1] ?? 0) &&
        scores[i] > (scores[i + 1] ?? 0)
      )
        candidates.push(i);
    const next = candidates[0] ?? expected;
    if (next <= start) break;
    boundaries.push({
      beat: next * 4,
      strength: Math.round(scores[next] * 1000) / 1000,
      reason: next === bars ? 'end' : next === expected ? 'phrase' : 'change',
    });
    start = next;
  }
  if (boundaries.at(-1)!.beat < bars * 4)
    boundaries.push({ beat: bars * 4, strength: 0, reason: 'end' });
  return boundaries;
}

export type FitnessBeatDynamics = { energy: number; mode: 'rest' | 'light' | 'active' };
/** Relative dynamics on the supplied grid. Breaks remain separate from phrase boundaries. */
export function planFitnessDynamics(
  onsets: Float32Array,
  levels: Float32Array,
  anchorMs: number,
  beatMs: number,
  endBeat: number,
  rate: number,
): FitnessBeatDynamics[] {
  const beats = Array.from({ length: Math.ceil(endBeat) }, (_, i) => ({
    level: meanLevel(levels, anchorMs + i * beatMs, anchorMs + (i + 1) * beatMs, rate),
    attack: meanLevel(onsets, anchorMs + i * beatMs, anchorMs + (i + 1) * beatMs, rate),
  }));
  const reference = (values: number[]) =>
    values.sort((a, b) => a - b)[Math.floor(values.length * 0.75)] ?? 0;
  const levelRef = Math.max(1e-8, reference(beats.map((b) => b.level)));
  const attackRef = Math.max(1e-8, reference(beats.map((b) => b.attack)));
  const energy = beats.map((b) =>
    Math.min(1, (0.65 * b.level) / levelRef + (0.35 * b.attack) / attackRef),
  );
  return beats.map((b, i) => {
    const local = beats.slice(Math.max(0, i - 4), Math.min(beats.length, i + 5));
    const localLevel = Math.max(...local.map((v) => v.level));
    const localAttack = Math.max(...local.map((v) => v.attack));
    const deepQuiet = b.level < levelRef * 0.08;
    const drop = b.level < localLevel * 0.25 && b.attack < Math.max(1e-8, localAttack) * 0.3;
    const barEnergy = energy.slice(Math.floor(i / 4) * 4, Math.floor(i / 4) * 4 + 4);
    const average = barEnergy.reduce((sum, v) => sum + v, 0) / barEnergy.length;
    return {
      energy: average,
      mode: deepQuiet || drop ? 'rest' : average < 0.5 ? 'light' : 'active',
    };
  });
}
