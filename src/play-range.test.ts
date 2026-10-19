import { describe, expect, it } from 'vitest';
import { blankChart, parseChart, serializeChart, type Chart } from './model';
import {
  chartPlayRange,
  parsePlayTime,
  playableChart,
  playDuration,
  playRangeCrossings,
} from './play-range';
import { publishSong, type Song } from './library';
import { createCalorieIndex } from './calories';
import { comboAt, createComboIndex } from './combo';

function fixture(): Chart {
  const chart = blankChart('Play range');
  chart.videoHint = {
    fileName: 'range.mp4',
    durationMs: 20000,
    assetId: '11111111-2222-3333-4444-555555555555',
  };
  chart.playRange = { startMs: 5000, endMs: 15000 };
  chart.specialMove = { name: 'STAR', icon: 'star', previewBeats: 2 };
  chart.notes = [
    { id: 'before', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 4000 },
    { id: 'at-start', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 5000 },
    {
      id: 'inside',
      lane: 'step',
      direction: 'left',
      kind: 'hold',
      modifier: 'none',
      timeMs: 7000,
      endTimeMs: 15000,
    },
    { id: 'at-end', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 15000 },
    { id: 'after', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 16000 },
  ];
  chart.specialEvents = [
    { id: 'special-before', timeMs: 3000 },
    { id: 'special-in', timeMs: 10000, endTimeMs: 12000 },
    { id: 'special-after', timeMs: 17000 },
  ];
  return chart;
}

describe('saved play ranges', () => {
  it('keeps v1 charts backward compatible and round-trips absolute video bounds', () => {
    const legacy = blankChart();
    expect(parseChart(legacy).playRange).toBeUndefined();
    expect(playableChart(legacy)).toBe(legacy);
    const chart = fixture();
    expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
    expect(playDuration(chart)).toBe(10000);
  });
  it.each([
    null,
    [],
    { startMs: -1, endMs: 1000 },
    { startMs: 1000, endMs: 1000 },
    { startMs: 2000, endMs: 1000 },
    { startMs: 0.1, endMs: 5000 },
    { startMs: 0, endMs: 21000 },
    { startMs: '0', endMs: 1000 },
  ])('rejects invalid bounds %j', (playRange) => {
    expect(() => parseChart({ ...fixture(), playRange })).toThrow('游玩区间');
  });
  it('validates the selected interval against a newly paired video duration', () => {
    expect(() => parseChart(fixture(), 10000)).toThrow('游玩区间');
  });
  it('filters [start, end) arrivals, accepts holds ending at the boundary, and preserves drafts', () => {
    const chart = fixture();
    const playable = playableChart(chart);
    expect(playable.notes.map((note) => note.id)).toEqual(['at-start', 'inside']);
    expect(playable.specialEvents.map((event) => event.id)).toEqual(['special-in']);
    expect(playable.notes[1].timeMs).toBe(7000);
    expect(chart.notes).toHaveLength(5);
    expect(createCalorieIndex(playable.notes).at(-1)!.kcal).toBeLessThan(
      createCalorieIndex(chart.notes).at(-1)!.kcal,
    );
    expect(comboAt(createComboIndex(playable), 4999)).toBe(0);
    expect(comboAt(createComboIndex(playable), 5000)).toBe(1);
  });
  it.each([-500, 500])('keeps video bounds fixed with video offset %i ms', (videoOffsetMs) => {
    const chart = fixture();
    chart.videoOffsetMs = videoOffsetMs;
    chart.notes = chart.notes.map((note) =>
      note.kind === 'hold'
        ? {
            ...note,
            timeMs: note.timeMs + videoOffsetMs,
            endTimeMs: note.endTimeMs + videoOffsetMs,
          }
        : { ...note, timeMs: note.timeMs + videoOffsetMs },
    );
    expect(chartPlayRange(chart)).toEqual({
      startMs: 5000 + videoOffsetMs,
      endMs: 15000 + videoOffsetMs,
    });
    expect(playableChart(chart).notes.map((note) => note.id)).toEqual(['at-start', 'inside']);
    expect(chart.playRange).toEqual({ startMs: 5000, endMs: 15000 });
  });
  it('flags overlapping HOLD, SWAY and SPECIAL without truncating or flagging fully excluded holds', () => {
    const chart = fixture();
    chart.notes.push(
      {
        id: 'cross-start',
        lane: 'step',
        direction: 'left',
        kind: 'hold',
        modifier: 'none',
        timeMs: 4500,
        endTimeMs: 5500,
      },
      {
        id: 'cross-end',
        lane: 'step',
        direction: 'left',
        kind: 'hold',
        modifier: 'sway',
        timeMs: 14000,
        endTimeMs: 16000,
      },
      {
        id: 'outside-hold',
        lane: 'step',
        direction: 'left',
        kind: 'hold',
        modifier: 'none',
        timeMs: 16000,
        endTimeMs: 19000,
      },
    );
    chart.specialEvents.push({ id: 'cross-special', timeMs: 14000, endTimeMs: 16000 });
    expect(playRangeCrossings(chart).map((event) => event.id)).toEqual([
      'cross-start',
      'cross-end',
      'cross-special',
    ]);
    expect(chart.notes.find((note) => note.id === 'cross-end')).toMatchObject({ endTimeMs: 16000 });
  });
  it('publishes independent ranges, retains outside draft data, and rejects empty/crossing intervals', () => {
    const chart = fixture();
    const song: Song = {
      id: '11223344-1234-1234-1234-aabbccddeeff',
      drafts: { hard: { chart, albumId: 'touhou', cover: '', updatedAt: 1 } },
      released: {},
    };
    const published = publishSong(song, 'hard');
    expect(published.released.hard!.chart.notes).toHaveLength(5);
    chart.playRange!.endMs = 6000;
    expect(published.released.hard!.chart.playRange!.endMs).toBe(15000);
    chart.playRange = { startMs: 18000, endMs: 20000 };
    expect(() => publishSong(song, 'hard')).toThrow('空谱面');
    chart.playRange = { startMs: 5000, endMs: 10000 };
    expect(() => publishSong(song, 'hard')).toThrow('跨越');
  });
  it.each([
    ['03:41', 221000],
    ['3:41.005', 221005],
    ['221', 221000],
    ['0.001', 1],
    ['00:00.12', 120],
    ['3:60', undefined],
    ['1.2.3', undefined],
    ['-1', undefined],
    ['', undefined],
  ])('parses video time %s', (input, expected) => {
    expect(parsePlayTime(String(input))).toBe(expected);
  });
});
