import { describe, expect, it } from 'vitest';
import { blankChart } from './model';
import { playerWarmupTimes } from './player-warmup';

describe('player render preparation', () => {
  it('samples real arrivals and releases without mutating notes or their timing', () => {
    const chart = blankChart();
    chart.notes = [
      {
        id: 'a',
        lane: 'squat',
        direction: 'down',
        kind: 'hold',
        modifier: 'none',
        timeMs: 1000,
        endTimeMs: 1040,
      },
      {
        id: 'b',
        lane: 'squat',
        direction: 'down',
        kind: 'hold',
        modifier: 'none',
        timeMs: 2000,
        endTimeMs: 4000,
      },
      { id: 'c', lane: 'step', direction: 'left', kind: 'tap', timeMs: 5000 },
    ];
    const original = JSON.stringify(chart);
    expect(playerWarmupTimes(chart)).toEqual([1020, 1120, 5080]);
    expect(JSON.stringify(chart)).toBe(original);
  });
  it('also prepares the configured special flight, arrival and release', () => {
    const chart = blankChart();
    chart.specialMove = { name: 'Test', icon: 'heart', previewBeats: 4 };
    chart.specialEvents = [{ id: 'special', timeMs: 6000, endTimeMs: 8000 }];
    expect(playerWarmupTimes(chart)).toEqual([5900, 6080, 8080]);
  });
});
