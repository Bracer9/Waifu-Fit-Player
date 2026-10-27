import { describe, expect, it } from 'vitest';
import { blankChart, chartCredit, parseChart, serializeChart, type Note } from './model';
import { focusMoves } from './start-briefing';

describe('start briefing data', () => {
  it('counts tap, hold and sway by lane without assigning duration or effort weights', () => {
    const chart = blankChart();
    const squat: Note = { id: 'tap', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 };
    chart.notes = [
      squat,
      { ...squat, id: 'hold', kind: 'hold', modifier: 'none', endTimeMs: 9000 },
      { ...squat, id: 'sway', kind: 'hold', modifier: 'sway', endTimeMs: 1500 },
      { ...squat, id: 'arm', lane: 'punch', direction: 'left' },
    ];
    const original = structuredClone(chart);
    const moves = focusMoves(chart);
    expect(moves.map((move) => move.count)).toEqual([3, 1, 0, 0, 0]);
    expect(moves.map((move) => move.share)).toEqual([0.75, 0.25, 0, 0, 0]);
    expect(moves.filter((move) => move.prominent).map((move) => move.id)).toEqual([
      'squat',
      'punch',
    ]);
    expect(chart).toEqual(original);
  });
  it('uses only the playable range and offset, with at most three nonempty prominent lanes', () => {
    const chart = blankChart();
    chart.playRange = { startMs: 2000, endMs: 6000 };
    chart.videoOffsetMs = 100;
    chart.notes = [
      { id: 'outside', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 2000 },
      ...(['squat', 'calf_raise', 'punch', 'step', 'side_crunch'] as const).map(
        (lane, index): Note => ({
          id: `inside-${index}`,
          lane,
          direction: 'left',
          kind: 'tap',
          timeMs: 2100 + index * 100,
        }),
      ),
    ];
    const moves = focusMoves(chart);
    expect(moves.map((move) => move.count)).toEqual([1, 1, 1, 1, 1]);
    expect(moves.filter((move) => move.prominent)).toHaveLength(3);
    chart.notes = [];
    expect(focusMoves(chart).every((move) => move.share === 0 && !move.prominent)).toBe(true);
  });
  it('reads actual optional credits and marks absent credits without guessing', () => {
    const legacy = Object.assign(blankChart(), { artist: '  Real artist  ', author: 'Ambiguous' });
    expect(chartCredit(legacy, 'music')).toBe('Real artist');
    expect(chartCredit(legacy, 'video')).toBe('');
    expect(chartCredit(legacy, 'mapper')).toBe('');
    expect(chartCredit(blankChart('Artist-looking song title'), 'music')).toBe('');
    const chart = {
      ...legacy,
      credits: { music: '', video: '  Studio / 映像  ', mapper: 'Mapper' },
    };
    expect(chartCredit(chart, 'music')).toBe('');
    expect(chartCredit(chart, 'video')).toBe('Studio / 映像');
    expect(chartCredit(chart, 'mapper')).toBe('Mapper');
    expect(parseChart(JSON.parse(serializeChart(chart))).credits).toEqual(chart.credits);
  });
  it('rejects malformed credits at the shared save/import boundary and accepts old charts', () => {
    expect(() => parseChart(blankChart())).not.toThrow();
    for (const credits of [
      null,
      'name',
      { mapper: 123 },
      { music: 'line\nbreak' },
      { video: 'x'.repeat(241) },
    ])
      expect(() => parseChart({ ...blankChart(), credits })).toThrow('制作署名');
  });
});
