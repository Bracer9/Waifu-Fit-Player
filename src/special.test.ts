import { describe, expect, it } from 'vitest';
import { blankChart, type Chart } from './model';
import { SPECIAL_BURST_MS, specialVisualsAt } from './special';

const fixture = (): Chart => ({
  ...blankChart(),
  specialMove: { name: 'HEART', icon: 'heart', previewBeats: 2 },
  tempoSegments: [
    { id: 'a', anchorMs: 0, bpm: 120, meter: '4/4' },
    { id: 'b', anchorMs: 6000, bpm: 150, meter: '4/4' },
  ],
  specialEvents: [
    { id: 'tap', timeMs: 5000 },
    { id: 'hold', timeMs: 8000, endTimeMs: 10000 },
  ],
});

describe('SPECIAL 五轨演出时序', () => {
  it('按所在 BPM 和预告拍数入场，五轨可共用同一进度并准时到框', () => {
    const chart = fixture();
    expect(specialVisualsAt(chart, 3999)).toEqual([]);
    expect(specialVisualsAt(chart, 4000)[0]).toMatchObject({ phase: 'flying', progress: 0 });
    expect(specialVisualsAt(chart, 4500)[0]).toMatchObject({ phase: 'flying', progress: 0.5 });
    expect(specialVisualsAt(chart, 5000)[0]).toMatchObject({
      phase: 'burst',
      progress: 1,
      bursts: [{ kind: 'arrival', progress: 0 }],
    });
    expect(specialVisualsAt(chart, 7199)).toEqual([]);
    expect(specialVisualsAt(chart, 7200)[0]).toMatchObject({ phase: 'flying', progress: 0 });
  });
  it('瞬间动作只在到框炸开，持续动作到尾端再炸开并清理', () => {
    const chart = fixture();
    expect(specialVisualsAt(chart, 5000 + SPECIAL_BURST_MS)).toEqual([]);
    expect(specialVisualsAt(chart, 8500)[0]).toMatchObject({ phase: 'holding', remaining: 0.75 });
    expect(specialVisualsAt(chart, 9000)[0]).toMatchObject({
      phase: 'holding',
      remaining: 0.5,
      bursts: [],
    });
    expect(specialVisualsAt(chart, 10000)[0]).toMatchObject({
      phase: 'burst',
      bursts: [{ kind: 'release', progress: 0 }],
    });
    expect(specialVisualsAt(chart, 10000 + SPECIAL_BURST_MS)).toEqual([]);
  });
  it('连续和重叠事件独立演出，短长条到框与结束也不会互相吞掉', () => {
    const chart = fixture();
    chart.specialEvents = [
      { id: 'first', timeMs: 5000, endTimeMs: 5200 },
      { id: 'next', timeMs: 5300 },
    ];
    const visuals = specialVisualsAt(chart, 5350);
    expect(visuals.map((v) => v.event.id)).toEqual(['first', 'next']);
    expect(visuals[0].bursts.map((b) => b.kind)).toEqual(['arrival', 'release']);
    expect(visuals[1].bursts.map((b) => b.kind)).toEqual(['arrival']);
  });
  it('暂停与回拖可重现同一帧，跳入中段不会补播已经过去的爆发', () => {
    const chart = fixture();
    const frame = specialVisualsAt(chart, 5100);
    specialVisualsAt(chart, 12000);
    expect(specialVisualsAt(chart, 5100)).toEqual(frame);
    expect(specialVisualsAt(chart, 9200)[0]).toMatchObject({ phase: 'holding', bursts: [] });
    expect(specialVisualsAt(chart, 1000)).toEqual([]);
    chart.specialMove = null;
    expect(specialVisualsAt(chart, 5100)).toEqual([]);
  });
});
