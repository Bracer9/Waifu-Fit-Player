import { expect, it } from 'vitest';
import { blankChart, parseChart } from '../model';
import { generateFitness } from './generate';
import { phraseFingerprint, musicSimilarity, findMusicRepeats } from './music';
import warehouse from './bricks.json';
import { planFitnessPhrases } from './structure';

function audio(seconds = 96) {
  const onsets = new Float32Array(seconds * 200),
    levels = new Float32Array(seconds * 200);
  for (let i = 0; i < levels.length; i++) levels[i] = 0.04 * (1 + 0.2 * Math.sin(i / 200));
  for (let t = 0.1; t < seconds; t += 0.5) {
    const i = Math.round(t * 200);
    for (let j = 0; j < 6 && i + j < onsets.length; j++)
      onsets[i + j] += [0, 0.4, 1, 0.6, 0.2, 0][j];
  }
  return { onsets, levels };
}
it('assembles a valid four-lane draft, leaves the input untouched and closes movement cycles', () => {
  const base = blankChart('test');
  base.videoHint.durationMs = 96000;
  base.videoOffsetMs = 350;
  base.notes = [{ id: 'authored', lane: 'step', direction: 'left', kind: 'tap', timeMs: 1000 }];
  const before = structuredClone(base),
    a = audio();
  const result = generateFitness(base, a.onsets, a.levels);
  expect(base).toEqual(before);
  expect(parseChart(result.chart)).toEqual(result.chart);
  expect(result.chart.chartType).toBe('fitness');
  expect(result.report.bpm).toBeCloseTo(120, 0);
  expect(result.chart.specialEvents).toEqual([]);
  expect(result.chart.specialMove).toBeNull();
  expect(new Set(result.chart.notes.map((n) => n.lane))).toEqual(
    new Set(['squat', 'punch', 'calf_raise', 'side_crunch']),
  );
  for (const section of result.report.sections) {
    expect(
      Math.min(
        ...result.chart.notes
          .filter((n) => n.timeMs >= section.startMs + 350 && n.timeMs < section.endMs + 350)
          .map((n) => n.timeMs),
      ),
    ).toBe(section.startMs + 350);
    const brick = warehouse.bricks.find((b) => b.id === section.brickId)!;
    if (brick.mirrorRequired) expect(section.repeats % 2).toBe(0);
    let squat = false,
      calf = false;
    for (const n of result.chart.notes.filter(
      (n) => n.timeMs >= section.startMs + 350 && n.timeMs < section.endMs + 350,
    )) {
      if (n.lane === 'squat') squat = n.direction === 'down';
      if (n.lane === 'calf_raise') calf = n.direction === 'up';
      expect(n.kind === 'hold' ? n.endTimeMs : n.timeMs).toBeLessThanOrEqual(section.endMs + 350);
    }
    expect(squat).toBe(false);
    expect(calf).toBe(false);
  }
  expect(
    result.chart.notes.every(
      (n) => n.timeMs >= 350 && (n.kind === 'tap' || n.endTimeMs <= result.report.endMs + 350),
    ),
  ).toBe(true);
  expect(result.report.sections[0].startMs).toBe(result.report.audioStartMs);
  for (let i = 1; i < result.report.sections.length; i++)
    expect(result.report.sections[i].startMs).toBe(result.report.sections[i - 1].endMs);
});
it('limits Side Crunch bouts, spacing and total exposure, including over a long song', () => {
  const base = blankChart();
  base.videoHint.durationMs = 300000;
  const a = audio(300),
    r = generateFitness(base, a.onsets, a.levels),
    beatMs = 60000 / r.report.bpm;
  const bouts = r.report.sections.filter((s) =>
    warehouse.bricks.find((b) => b.id === s.brickId)!.lanes.includes('side_crunch'),
  );
  expect(r.report.sideCrunch.usedBeats).toBeLessThanOrEqual(r.report.sideCrunch.budgetBeats);
  for (let i = 0; i < bouts.length; i++) {
    expect((bouts[i].endMs - bouts[i].startMs) / beatMs).toBeLessThanOrEqual(8.002);
    if (i) expect((bouts[i].startMs - bouts[i - 1].endMs) / beatMs).toBeGreaterThanOrEqual(95.998);
  }
  expect(r.report.sideCrunch.usedBeats).toBeLessThanOrEqual(
    ((r.report.endMs - r.report.audioStartMs) / beatMs) * 0.08,
  );
});
it('places a sharp music change at its beginning rather than one window later', () => {
  const a = audio(96);
  for (let i = 0; i < a.levels.length; i++) a.levels[i] *= i < 18 * 200 ? 1 : 8;
  const boundaries = planFitnessPhrases(a.onsets, a.levels, 100, 500, 184, 200);
  expect(boundaries[0].beat).toBe(0);
  expect(boundaries.some((b) => b.beat === 36)).toBe(true);
  expect(boundaries.some((b) => b.beat === 68)).toBe(true);
});
it('waits for a sustained intro entry without anticipating it by a bar', () => {
  const a = audio(96);
  for (let i = 0; i < a.levels.length; i++) a.levels[i] = i < 800 ? 0.02 : 0.1;
  const boundaries = planFitnessPhrases(a.onsets, a.levels, 100, 500, 184, 200);
  expect(boundaries[0].beat).toBe(8);
});
it('rejects silence and clear tempo changes without returning an unsafe partial chart', () => {
  const base = blankChart();
  base.videoHint.durationMs = 96000;
  const a = audio();
  expect(() => generateFitness(base, new Float32Array(19200), a.levels)).toThrow(/BPM/);
  a.onsets.fill(0, 9600);
  for (let t = 48.1; t < 96; t += 60 / 90) {
    const i = Math.round(t * 200);
    for (let j = 0; j < 6 && i + j < a.onsets.length; j++)
      a.onsets[i + j] += [0, 0.4, 1, 0.6, 0.2, 0][j];
  }
  expect(() => generateFitness(base, a.onsets, a.levels)).toThrow(/变速|歧义/);
});
it('compares beat-relative music patterns independently of absolute volume', () => {
  const a = audio();
  const b = Float32Array.from(a.levels, (v) => v * 3);
  const x = phraseFingerprint(a.onsets, a.levels, 0, 16000, 200),
    y = phraseFingerprint(a.onsets, b, 0, 16000, 200);
  expect(musicSimilarity(x, y)).toBeCloseTo(1, 5);
  expect(musicSimilarity(x, Array(128).fill(0))).toBe(0);
  const repeats = findMusicRepeats(a.onsets, a.levels, 0.1 * 1000, 500, 180, 200, 0.88);
  expect(repeats.every((p) => p.beat % 4 === 0)).toBe(true);
});
