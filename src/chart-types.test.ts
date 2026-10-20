import { describe, expect, it } from 'vitest';
import { blankChart, parseChart, serializeChart } from './model';
import { chartTypeFrom, ratingSummary, ratingValue } from './chart-types';
import { migrateSong, type Edition } from './library';

function legacy(difficulty?: string, difficultyRating?: number) {
  const chart: Record<string, unknown> = {
    ...blankChart('Legacy song'),
    difficulty,
    difficultyRating,
    videoOffsetMs: 100,
    playRange: { startMs: 0, endMs: 9000 },
    videoHint: { fileName: 'video.mp4', durationMs: 10000 },
    notes: [{ id: 'n', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 }],
  };
  delete chart.chartType;
  return chart;
}

describe('chart types and legacy migration', () => {
  it.each([
    ['normal', 'fitness'],
    ['hard', 'dance'],
    [undefined, 'dance'],
  ] as const)('imports %s as %s and exports only the new metadata', (old, expected) => {
    const chart = parseChart(legacy(old, 4.5));
    expect(chart.chartType).toBe(expected);
    expect(chart.danceDifficulty).toBe(4.5);
    expect(chart.intensity).toBeUndefined();
    const exported = JSON.parse(serializeChart(chart));
    expect(exported).not.toHaveProperty('difficulty');
    expect(exported).not.toHaveProperty('difficultyRating');
    expect(parseChart(exported)).toEqual(chart);
  });
  it('keeps a new explicit type and rating, and never turns an old level into intensity', () => {
    const chart = parseChart({ ...legacy('normal', 8.5), chartType: 'dance', danceDifficulty: 6 });
    expect(chart.chartType).toBe('dance');
    expect(chart.danceDifficulty).toBe(6);
    expect(ratingValue({ ...chart, chartType: 'fitness' })).toBe('—');
    expect(ratingSummary({ ...chart, chartType: 'fitness', intensity: 'high' })).toBe('强度 HIGH');
    expect(ratingSummary(chart)).toBe('难度 6');
    expect(chartTypeFrom('normal')).toBe('fitness');
  });
  it('rejects unknown types, intensity values and invalid numeric difficulty', () => {
    for (const chartType of ['normal', 'hard', 'other', null])
      expect(() => parseChart({ ...blankChart(), chartType })).toThrow('谱面类型');
    for (const intensity of ['hard', 'extreme', 3, null])
      expect(() => parseChart({ ...blankChart(), chartType: 'fitness', intensity })).toThrow(
        '运动强度',
      );
    for (const danceDifficulty of [-1, NaN, Infinity, '6'])
      expect(() => parseChart({ ...blankChart(), danceDifficulty })).toThrow('舞蹈难度');
    expect(() => parseChart(legacy('unknown'))).toThrow('旧谱面类型');
  });
  it('migrates both snapshot collections without changing content, covers or timestamps', () => {
    const edition = (name: string, time: number): Edition => ({
      chart: { ...legacy('hard', time), title: name } as unknown as Edition['chart'],
      albumId: 'anime',
      cover: `cover-${name}`,
      updatedAt: time,
    });
    const old = {
      id: 'song',
      drafts: { normal: edition('fitness draft', 1), hard: edition('dance draft', 2) },
      released: { normal: edition('fitness release', 3), hard: edition('dance release', 4) },
    };
    const original = structuredClone(old);
    const next = migrateSong(old);
    expect(old).toEqual(original);
    for (const collection of ['drafts', 'released'] as const) {
      expect(Object.keys(next[collection])).toEqual(['fitness', 'dance']);
      for (const [oldType, newType] of [
        ['normal', 'fitness'],
        ['hard', 'dance'],
      ] as const) {
        const before = old[collection][oldType],
          after = next[collection][newType]!;
        expect(after.chart.chartType).toBe(newType);
        expect(after.chart.notes).toEqual(before.chart.notes);
        expect(after.chart.videoHint).toEqual(before.chart.videoHint);
        expect(after.chart.playRange).toEqual(before.chart.playRange);
        expect(after.chart.videoOffsetMs).toBe(100);
        expect(after.chart.intensity).toBeUndefined();
        expect(after.cover).toBe(before.cover);
        expect(after.updatedAt).toBe(before.updatedAt);
        expect(after.chart).not.toHaveProperty('difficulty');
      }
    }
    expect(migrateSong(next)).toEqual(next);
  });
});
