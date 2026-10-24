/** Compact beat-relative rhythm/dynamics fingerprints, not melody recognition. */
export function phraseFingerprint(
  onsets: Float32Array,
  levels: Float32Array,
  startMs: number,
  endMs: number,
  rate: number,
) {
  const channels: number[][] = [[], []];
  for (let cell = 0; cell < 64; cell++) {
    const start = Math.max(
      0,
      Math.floor(((startMs + ((endMs - startMs) * cell) / 64) / 1000) * rate),
    );
    const end = Math.min(
      levels.length,
      Math.max(
        start + 1,
        Math.floor(((startMs + ((endMs - startMs) * (cell + 1)) / 64) / 1000) * rate),
      ),
    );
    let attack = 0,
      level = 0;
    for (let i = start; i < end; i++) {
      attack += onsets[i] ?? 0;
      level += levels[i] ?? 0;
    }
    channels[0].push(attack / (end - start || 1));
    channels[1].push(level / (end - start || 1));
  }
  return channels.flatMap((values) => {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const centered = values.map((v) => v - mean);
    const norm = Math.sqrt(centered.reduce((s, v) => s + v * v, 0));
    return centered.map((v) => (norm > 1e-8 ? v / norm : 0));
  });
}
export function musicSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
  const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0));
  return norm ? dot / norm : 0;
}
export type MusicRepeat = {
  beat: number;
  beats: number;
  previousBeat?: number;
  similarity: number;
};
/** Repetitions may be separated by an odd number of bars: search every bar. */
export function findMusicRepeats(
  onsets: Float32Array,
  levels: Float32Array,
  anchorMs: number,
  beatMs: number,
  finalBeat: number,
  rate: number,
  threshold: number,
): MusicRepeat[] {
  const pairs: { a: number; b: number; beats: number; similarity: number }[] = [];
  for (const beats of [16, 32]) {
    const windows: { beat: number; features: number[] }[] = [];
    for (let beat = 8; beat + beats <= finalBeat; beat += 4)
      windows.push({
        beat,
        features: phraseFingerprint(
          onsets,
          levels,
          anchorMs + beat * beatMs,
          anchorMs + (beat + beats) * beatMs,
          rate,
        ),
      });
    for (let i = 0; i < windows.length; i++)
      for (let j = i + 1; j < windows.length; j++) {
        if (windows[j].beat - windows[i].beat < beats) continue;
        const similarity = musicSimilarity(windows[i].features, windows[j].features);
        if (similarity >= threshold)
          pairs.push({ a: windows[i].beat, b: windows[j].beat, beats, similarity });
      }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);
  const chosen: MusicRepeat[] = [];
  const fits = (start: number, beats: number) =>
    chosen.every(
      (p) =>
        (p.beat === start && p.beats === beats) ||
        start + beats <= p.beat ||
        start >= p.beat + p.beats,
    );
  for (const pair of pairs) {
    if (!fits(pair.a, pair.beats) || !fits(pair.b, pair.beats)) continue;
    if (!chosen.some((p) => p.beat === pair.a))
      chosen.push({ beat: pair.a, beats: pair.beats, similarity: 1 });
    if (!chosen.some((p) => p.beat === pair.b))
      chosen.push({
        beat: pair.b,
        beats: pair.beats,
        previousBeat: pair.a,
        similarity: pair.similarity,
      });
    if (chosen.length >= 8) break;
  }
  return chosen.sort((a, b) => a.beat - b.beat);
}
export function meanLevel(levels: Float32Array, startMs: number, endMs: number, rate: number) {
  const start = Math.max(0, Math.floor((startMs / 1000) * rate)),
    end = Math.min(levels.length, Math.floor((endMs / 1000) * rate));
  let sum = 0;
  for (let i = start; i < end; i++) sum += levels[i];
  return sum / (end - start || 1);
}
