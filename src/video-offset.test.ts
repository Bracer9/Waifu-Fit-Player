import { describe, expect, it } from 'vitest';
import { blankChart, parseChart, serializeChart, type Chart } from './model';
import { chartTimeAt, videoTimeAt } from './timing';

describe('video/audio playback offset', () => {
  it.each([-1000, -1, 0, 1, 1000])(
    'round-trips %i ms without moving authored events or tempo',
    (offset) => {
      const chart: Chart = {
        ...blankChart(),
        videoOffsetMs: offset,
        videoHint: { fileName: 'video.mp4', durationMs: 10000 },
        notes: [{ id: 'tap', lane: 'squat', direction: 'down', timeMs: 3000, kind: 'tap' }],
      };
      expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
      expect(videoTimeAt(chart, chartTimeAt(chart, 2500))).toBe(2500);
      expect(chartTimeAt(chart, 2500)).toBe(2500 + offset);
    },
  );
  it('defaults old charts to zero and keeps negative pre-roll time before the first action', () => {
    expect(chartTimeAt({}, 1234)).toBe(1234);
    expect(videoTimeAt({}, 1234)).toBe(1234);
    expect(chartTimeAt({ videoOffsetMs: -500 }, 0)).toBe(-500);
  });
  it.each([-1001, 1001, 0.5, '500', null, NaN])('rejects invalid offset %s', (offset) => {
    expect(() => parseChart({ ...blankChart(), videoOffsetMs: offset })).toThrow('视频偏移');
  });
});
