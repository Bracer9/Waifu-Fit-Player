import { expect, it } from 'vitest';
import { analyzeFirstBeat, estimateFirstBeat, firstBeatWindow } from './first-beat';
import { blankChart } from './model';
import { gunzipSync } from 'node:zlib';
import kissOnsets from '../tests/fixtures/kiss-first-beat-onsets.json';

function pulses(bpm: number, startMs: number) {
  const values = new Float32Array(200 * 30);
  for (let beat = startMs / 1000; beat < 30; beat += 60 / bpm) {
    const start = Math.round(beat * 200);
    for (let i = 0; i < 12 && start + i < values.length; i++) {
      values[start + i] = i <= 5 ? i / 5 : (12 - i) / 7;
    }
  }
  return values;
}

it.each([
  [120, 125],
  [150, 2400],
  [148, 830],
])('locates the first supported attack at %i BPM after an intro', (bpm, start) => {
  const result = estimateFirstBeat(pulses(bpm, start), bpm);
  expect(result).not.toBeNull();
  expect(Math.abs(result!.timeMs - start)).toBeLessThanOrEqual(20);
});

it('does not mistake an isolated loud intro for a steady beat', () => {
  const values = pulses(120, 2400);
  values[20] = 100;
  expect(Math.abs(estimateFirstBeat(values, 120)!.timeMs - 2400)).toBeLessThanOrEqual(20);
});

it('does not approve the Kiss Kitsune 2780ms origin when a shorter observation disagrees by a bar', () => {
  const bytes = gunzipSync(Buffer.from(kissOnsets.data, 'base64'));
  const values = Float32Array.from(
    { length: kissOnsets.samples },
    (_, i) => bytes.readUInt16LE(i * 2) / kissOnsets.scale,
  );
  const result = analyzeFirstBeat(values, kissOnsets.bpm, kissOnsets.sampleRate);
  expect(result.kind).toBe('ambiguous-origin');
  expect(estimateFirstBeat(values, kissOnsets.bpm, kissOnsets.sampleRate)).toBeNull();
  if (result.kind === 'ambiguous-origin')
    expect(Math.max(...result.candidatesMs) - Math.min(...result.candidatesMs)).toBeGreaterThan(
      (3 * 60000) / kissOnsets.bpm,
    );
});

it('recovers a quiet repeated opening rather than moving its origin to a louder section', () => {
  const values = pulses(120, 125);
  for (let i = 200 * 8; i < values.length; i++) values[i] *= 8;
  expect(analyzeFirstBeat(values, 120)).toMatchObject({
    kind: 'candidate',
    result: { timeMs: expect.any(Number), rhythmRepeat: { beats: 4 } },
  });
  const result = estimateFirstBeat(values, 120)!;
  expect(Math.abs(result.timeMs - 125)).toBeLessThanOrEqual(20);
});

it('does not accept an isolated opening SE even when it coincides with the later beat phase', () => {
  const values = pulses(120, 2625);
  const hit = pulses(120, 125).slice(0, 50);
  values.set(hit, 0);
  expect(analyzeFirstBeat(values, 120)).toMatchObject({
    kind: 'ambiguous-origin',
    reason: 'isolated-opening',
  });
});

it('preserves a consistent first-attack candidate and rejects unclear audio', () => {
  expect(analyzeFirstBeat(pulses(120, 125), 120)).toMatchObject({
    kind: 'candidate',
    result: { timeMs: expect.any(Number) },
  });
  expect(analyzeFirstBeat(new Float32Array(6000), 120)).toEqual({ kind: 'unclear' });
});

it('rejects silence, isolated attacks, short clips, random noise and incompatible BPM', () => {
  expect(estimateFirstBeat(new Float32Array(6000), 120)).toBeNull();
  expect(estimateFirstBeat(pulses(120, 0).slice(0, 1000), 120)).toBeNull();
  const isolated = new Float32Array(6000);
  isolated[100] = 10;
  expect(estimateFirstBeat(isolated, 120)).toBeNull();
  let seed = 19;
  const noise = Float32Array.from({ length: 6000 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  });
  expect(estimateFirstBeat(noise, 120)).toBeNull();
  expect(estimateFirstBeat(pulses(120, 100), 137)).toBeNull();
  expect(estimateFirstBeat(pulses(120, 100), 0)).toBeNull();
});

it('searches the first segment from the play-range start, not its old anchor', () => {
  const chart = { ...blankChart(), videoOffsetMs: 350 };
  chart.tempoSegments = [
    { id: 'a', anchorMs: 5000, bpm: 120, meter: '4/4' },
    { id: 'b', anchorMs: 14000, bpm: 120, meter: '4/4' },
  ];
  expect(firstBeatWindow(chart, chart.tempoSegments[0], 60000)).toEqual({ start: 0, end: 13.649 });
  expect(
    firstBeatWindow(
      { ...chart, playRange: { startMs: 2000, endMs: 10000 } },
      chart.tempoSegments[0],
      60000,
    ),
  ).toEqual({ start: 2, end: 10 });
});

it('does not cross neighbouring tempo segments when searching around a later anchor', () => {
  const chart = { ...blankChart(), videoOffsetMs: 350 };
  chart.tempoSegments = [
    { id: 'a', anchorMs: 5000, bpm: 120, meter: '4/4' },
    { id: 'b', anchorMs: 6000, bpm: 120, meter: '4/4' },
    { id: 'c', anchorMs: 14000, bpm: 120, meter: '4/4' },
  ];
  expect(firstBeatWindow(chart, chart.tempoSegments[1], 60000)).toEqual({
    start: 4.651,
    end: 13.649,
  });
});
