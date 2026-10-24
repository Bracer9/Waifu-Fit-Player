import { expect, it } from 'vitest';
import { blankChart, parseChart } from '../model';
import { fitnessPatterns, insertFitnessPattern, stampPattern } from './patterns';

function chart() {
  const c = blankChart('pattern test');
  c.chartType = 'fitness';
  c.videoHint.durationMs = 120000;
  c.tempoSegments = [{ id: 'tempo', anchorMs: 100, bpm: 120, meter: '4/4' }];
  return c;
}
it('normalizes the first action without removing the observed recovery space or opening movement cycles', () => {
  for (const p of fitnessPatterns) {
    expect(Math.min(...p.notes.map((n) => n.at))).toBe(0);
    const notes = stampPattern(p, 100, 500, p.mirrorRequired ? 2 : 1);
    expect(parseChart({ ...chart(), notes }).notes).toEqual(notes);
    for (const lane of ['squat', 'calf_raise']) {
      const movements = notes.filter((n) => n.lane === lane);
      if (movements.length)
        expect(movements.at(-1)!.direction).toBe(lane === 'squat' ? 'up' : 'down');
    }
    expect(
      notes.every(
        (n) =>
          (n.kind === 'hold' ? n.endTimeMs : n.timeMs) <=
          100 + p.beats * (p.mirrorRequired ? 2 : 1) * 500,
      ),
    ).toBe(true);
  }
});
it('inserts a multi-track group as a unit, mirrors hands and directions, and preserves unrelated notes', () => {
  const c = chart();
  c.videoOffsetMs = 250;
  c.notes = [{ id: 'keep', lane: 'step', kind: 'tap', direction: 'left', timeMs: 3000 }];
  const before = structuredClone(c),
    p = fitnessPatterns.find((p) => p.mirrorRequired && p.lanes.includes('punch'))!;
  const r = insertFitnessPattern(c, { id: p.id, repeats: 1, mirror: true }, 3250);
  expect(c).toEqual(before);
  expect(r.startMs).toBe(4100);
  expect(r.repeats).toBe(2);
  expect(r.chart.notes.find((n) => n.id === 'keep')).toEqual(c.notes[0]);
  expect(r.ids).toHaveLength(p.notes.length * 2);
  const a = stampPattern(p, 4100, 500, 2, false),
    b = stampPattern(p, 4100, 500, 2, true);
  expect(a.map((n) => n.timeMs)).toEqual(b.map((n) => n.timeMs));
  expect(a.some((n, i) => n.direction !== b[i].direction || n.hand !== b[i].hand)).toBe(true);
});
it('refuses overlap, invalid repeats, out-of-range and cross-tempo insertion without changing the chart', () => {
  const c = chart(),
    p = fitnessPatterns[0],
    request = { id: p.id, repeats: 2, mirror: false };
  const filled = insertFitnessPattern(c, request, 100).chart,
    before = structuredClone(filled);
  expect(() => insertFitnessPattern(filled, request, 100)).toThrow(/已有动作/);
  expect(filled).toEqual(before);
  expect(() => insertFitnessPattern(c, { ...request, repeats: 3 }, 100)).toThrow(/1／2／4／8/);
  expect(() => insertFitnessPattern(c, request, 119000)).toThrow(/游玩区间/);
  c.tempoSegments.push({ id: 'change', anchorMs: 2100, bpm: 150, meter: '4/4' });
  expect(() => insertFitnessPattern(c, request, 100)).toThrow(/变速/);
  c.tempoSegments = c.tempoSegments.slice(0, 1);
  c.tempoSegments[0].meter = '3/4';
  expect(() => insertFitnessPattern(c, request, 100)).toThrow(/4\/4/);
  c.chartType = 'dance';
  expect(() => insertFitnessPattern(c, request, 100)).toThrow(/FITNESS/);
});
