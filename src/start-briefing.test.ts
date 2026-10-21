import { describe, expect, it } from 'vitest';
import { blankChart, type Note } from './model';
import { chartArtist, focusMoves } from './start-briefing';

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
    expect(chartArtist({ ...blankChart(), artist: '  Real artist  ' })).toBe('Real artist');
    expect(chartArtist({ ...blankChart(), artist: '', author: 'Author' })).toBe('Author');
    expect(chartArtist(blankChart('Artist-looking song title'))).toBe('未标注');
  });
});
