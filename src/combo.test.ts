import { describe, expect, it } from 'vitest';
import { blankChart, type Note } from './model';
import { comboAt, createBeatMap, createComboIndex, sustainPulseAt } from './combo';

const hold = (modifier: 'none' | 'sway' = 'none'): Extract<Note, { kind: 'hold' }> => ({
  id: modifier,
  lane: 'step',
  direction: 'left',
  kind: 'hold',
  modifier,
  timeMs: 1000,
  endTimeMs: 2000,
});

describe('follow-along combo', () => {
  it.each(['none', 'sway'] as const)('scores %s head, half-beats and one tail', (modifier) => {
    const chart = blankChart();
    chart.notes = [hold(modifier)];
    const index = createComboIndex(chart);
    expect(
      [999, 1000, 1249, 1250, 1500, 1750, 1999, 2000, 5000].map((t) => comboAt(index, t)),
    ).toEqual([0, 1, 1, 2, 3, 4, 4, 5, 5]);
  });

  it('scores partial tails and sub-half-beat holds without dropping their releases', () => {
    const chart = blankChart();
    chart.notes = [
      { ...hold(), id: 'short', endTimeMs: 1100 },
      { ...hold(), id: 'partial', endTimeMs: 1600 },
    ];
    const index = createComboIndex(chart);
    expect(comboAt(index, 1000)).toBe(2);
    expect(comboAt(index, 1100)).toBe(3);
    expect(comboAt(index, 1600)).toBe(6);
  });

  it('integrates a BPM change through the middle of a held half-beat', () => {
    const chart = blankChart();
    chart.tempoSegments.push({ id: 'faster', anchorMs: 1375, bpm: 240, meter: '3/4' });
    chart.notes = [{ ...hold(), endTimeMs: 1812 }];
    const index = createComboIndex(chart);
    // Tick at 1250; half a tick remains at the tempo change, so the next is at 1437.5.
    expect([1375, 1437, 1438, 1562, 1563, 1688, 1811, 1812].map((t) => comboAt(index, t))).toEqual([
      2, 2, 3, 3, 4, 5, 5, 6,
    ]);
  });

  it('combines simultaneous taps and holds and recomputes after backwards seeks', () => {
    const chart = blankChart();
    chart.notes = [
      hold(),
      { ...hold('sway'), id: 'sway' },
      { id: 'tap', lane: 'squat', direction: 'up', kind: 'tap', timeMs: 1500 },
    ];
    const index = createComboIndex(chart);
    expect([2000, 1500, 1500, 0, 1250, 2000].map((t) => comboAt(index, t))).toEqual([
      11, 7, 7, 0, 4, 11,
    ]);
  });

  it('uses the default lead-in tempo and does not mutate unsorted tempo segments', () => {
    const chart = blankChart();
    chart.tempoSegments = [
      { id: 'late', anchorMs: 3000, bpm: 60, meter: '4/4' },
      { id: 'first', anchorMs: 1500, bpm: 240, meter: '4/4' },
    ];
    chart.notes = [hold()];
    const before = structuredClone(chart);
    expect(comboAt(createComboIndex(chart), 2000)).toBe(7);
    expect(chart).toEqual(before);
  });

  it('keeps sustain light in phase with scoring, including pause, seek and release', () => {
    const beats = createBeatMap(blankChart().tempoSegments);
    expect(
      [999, 1000, 1200, 1250, 1250, 1000, 2000].map((t) => sustainPulseAt(hold(), t, beats)),
    ).toEqual([0, 1, 0, 1, 1, 1, 0]);
  });
});
