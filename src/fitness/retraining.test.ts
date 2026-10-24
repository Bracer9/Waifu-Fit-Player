import { expect, it } from 'vitest';
import warehouse from './bricks-study.json';
import { normalizeFitnessPattern, stampPattern } from './patterns';
import { blankChart, parseChart } from '../model';
import { movementModes } from './movement';
import { fitContext, matchMovement } from './learning';
import { MusicSpectrum } from './spectrum';

it('retains sparse sustained squat and calf movements with their actual duration, directions and simultaneous arms', () => {
  const patterns = warehouse.bricks.map(normalizeFitnessPattern);
  for (const mode of ['squat:hold', 'squat:sway', 'calf_raise:sway']) {
    const p = patterns.find(
      (p) =>
        movementModes(p.notes).includes(mode as never) &&
        p.notes.some((n) => n.kind === 'hold' && (n.duration ?? 0) >= 24),
    )!;
    expect(p).toBeDefined();
    const notes = stampPattern(p, 1000, 60000 / 132, 1),
      chart = blankChart();
    chart.videoHint.durationMs = 120000;
    expect(parseChart({ ...chart, notes }).notes).toEqual(notes);
    const long = notes.find((n) => n.kind === 'hold' && n.lane === mode.split(':')[0])!;
    expect(long.kind === 'hold' && long.endTimeMs - long.timeMs).toBeGreaterThan(10000);
  }
  const sparse = patterns.find(
    (p) => p.notes.length === 1 && p.notes[0].lane === 'squat' && p.notes[0].kind === 'hold',
  );
  expect(sparse).toBeDefined();
  const pair = patterns.find(
    (p) =>
      p.notes.some((n) => n.lane === 'calf_raise' && n.modifier === 'sway') &&
      p.notes.some((n) => n.lane === 'punch' && n.kind === 'hold'),
  )!;
  const stamped = stampPattern(pair, 1000, 400, 1);
  expect(stamped.filter((n) => n.lane === 'punch')).toHaveLength(
    pair.notes.filter((n) => n.lane === 'punch').length,
  );
  // Release is already conveyed by the source hold duration, not invented data.
  expect(stamped.filter((n) => n.lane === 'calf_raise').every((n) => n.kind === 'hold')).toBe(true);
});

it('counts a return tap as part of the sustained action rather than a separate tap workout', () => {
  expect(
    movementModes([
      { lane: 'squat', kind: 'hold', modifier: 'sway', direction: 'down', at: 0, duration: 28 },
      { lane: 'squat', kind: 'tap', direction: 'up', at: 28 },
    ]),
  ).toEqual(['squat:sway']);
});

it('fits held-out normalization solely on training songs and returns evidence with actual sources', () => {
  const samples = [
    {
      song: 'a',
      brickId: 'one',
      family: 'squat:hold',
      beats: 32,
      startMs: 0,
      endMs: 16000,
      values: [0, 0],
    },
    {
      song: 'b',
      brickId: 'two',
      family: 'calf_raise:sway',
      beats: 32,
      startMs: 0,
      endMs: 16000,
      values: [1, 1],
    },
  ];
  const model = fitContext(samples),
    before = structuredClone(samples);
  const match = matchMovement({ values: [0, 0], spectral: true }, 32, model);
  expect(match.bricks.one).toBeGreaterThan(0.95);
  expect(match.neighbours[0].song).toBe('a');
  expect(samples).toEqual(before);
  expect(fitContext(samples.filter((s) => s.song !== 'b')).means).toEqual([0, 0]);
});

it('keeps opposite-phase stereo musical content and timestamp gaps in the generation-only spectrum', () => {
  const sr = 22050,
    seconds = 2;
  const wave = Float32Array.from({ length: sr * seconds }, (_, i) =>
    Math.sin((2 * Math.PI * 440 * i) / sr),
  );
  const mono = new MusicSpectrum(),
    stereo = new MusicSpectrum();
  mono.push([wave], sr, 1);
  stereo.push([wave, Float32Array.from(wave, (v) => -v)], sr, 1);
  const a = mono.data(),
    b = stereo.data();
  expect(a.frames).toEqual(b.frames);
  expect(
    a.frames
      .slice(0, 8)
      .flat()
      .every((v) => v === 0),
  ).toBe(true);
  expect(a.frames.slice(12, 25).some((f) => f.some((v) => v > 0.1))).toBe(true);
});
