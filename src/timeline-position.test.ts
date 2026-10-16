import { describe, expect, it } from 'vitest';
import { parseTimelinePosition } from './timing';
import type { TempoSegment } from './model';

const segments: TempoSegment[] = [
  { id: 'first', anchorMs: 2000, bpm: 120, meter: '4/4' },
  { id: 'second', anchorMs: 300000, bpm: 90, meter: '3/4' },
];
describe('循环范围直接输入', () => {
  it('按时间轴段号和小节号定位远处小节，并支持拍号和变拍段', () => {
    expect(parseTimelinePosition('1.128', segments)).toBe(256000);
    expect(parseTimelinePosition('128', segments)).toBe(256000);
    expect(parseTimelinePosition('1.128.3', segments)).toBe(257000);
    expect(parseTimelinePosition('2.2.3', segments)).toBe(303333);
    expect(parseTimelinePosition('2.2.4', segments)).toBeUndefined();
    expect(parseTimelinePosition('1.151', segments)).toBeUndefined();
    expect(parseTimelinePosition('0', segments)).toBeUndefined();
  });
  it('精确时间与毫秒输入不做网格吸附', () => {
    expect(parseTimelinePosition('03:12.501', segments)).toBe(192501);
    expect(parseTimelinePosition('3:12.5', segments)).toBe(192500);
    expect(parseTimelinePosition('192501ms', segments)).toBe(192501);
    expect(parseTimelinePosition('3:72', segments)).toBeUndefined();
    expect(parseTimelinePosition('', segments)).toBeUndefined();
  });
});
