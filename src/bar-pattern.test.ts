import { expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import fixture from '../tests/fixtures/kiss-bar-pattern.json';
import { analyzeFirstBeat } from './first-beat';
import { estimateBarPattern } from './bar-pattern';

it('recovers a near-zero bar origin for real Kiss Kitsune instead of its louder 2780ms attack', () => {
  const raw = gunzipSync(Buffer.from(fixture.onsets, 'base64'));
  const onsets = Float32Array.from(
    { length: raw.length / 2 },
    (_, i) => raw.readUInt16LE(i * 2) / 256,
  );
  const spectral = gunzipSync(Buffer.from(fixture.spectrum, 'base64'));
  const frames = Array.from({ length: fixture.frames }, (_, i) =>
    Array.from({ length: 24 }, (_, j) => spectral[i * 24 + j] / 255),
  );
  const result = analyzeFirstBeat(onsets, fixture.bpm, fixture.rate, {
    spectrum: { rate: fixture.spectrumRate, frames },
    beatsPerBar: 4,
  });
  expect(result).toMatchObject({
    kind: 'candidate',
    result: { timeMs: 0, pattern: { supportingWindows: expect.any(Number) } },
  });
  if (result.kind === 'candidate') {
    expect(result.result.pattern!.supportingWindows).toBeGreaterThanOrEqual(2);
    expect(result.result.pattern!.patternBeats).toBeGreaterThanOrEqual(4);
    expect(result.result.pattern!.edgeSnapMs).toBeLessThanOrEqual(80);
  }
});

it.each([
  [3, 0.625],
  [4, 0.625],
  [4, 2.125],
] as const)(
  'uses recurring bar boundaries in %i/4 at %f seconds, not an isolated on-grid SE',
  (meter, start) => {
    const rate = 200,
      bpm = 120,
      seconds = 60,
      period = 0.5;
    const onsets = new Float32Array(seconds * rate);
    const accent = (t: number, amount: number) => {
      const i = Math.round(t * rate);
      for (let j = 0; j < 10 && i + j < onsets.length; j++)
        onsets[i + j] = amount * (j < 3 ? j / 3 : (10 - j) / 7);
    };
    accent(0.125, 20); // An SE exactly on the later quarter-note grid.
    for (let t = start; t < seconds; t += period) accent(t, 2);
    const frames = Array.from({ length: seconds * 10 }, (_, i) => {
      const bar = Math.floor((i / 10 - start) / (period * meter)),
        pitch = ((bar % 4) + 4) % 4;
      return Array.from({ length: 24 }, (_, j) =>
        i / 10 < start ? 0 : j === pitch || j === pitch + 12 ? 1 : 0,
      );
    });
    const result = estimateBarPattern(
      onsets,
      bpm,
      125,
      { spectrum: { rate: 10, frames }, beatsPerBar: meter },
      rate,
    );
    expect(result).not.toBeNull();
    expect(Math.abs(result!.timeMs - start * 1000)).toBeLessThanOrEqual(25);
  },
);

it('does not invent a downbeat from constant spectral features or insufficient music', () => {
  const onsets = new Float32Array(60 * 200).fill(1);
  const spectrum = { rate: 10, frames: Array.from({ length: 600 }, () => Array(24).fill(0.2)) };
  expect(estimateBarPattern(onsets, 120, 100, { spectrum })).toBeNull();
  expect(estimateBarPattern(onsets.subarray(0, 2000), 120, 100, { spectrum })).toBeNull();
});
