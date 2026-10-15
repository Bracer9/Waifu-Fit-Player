import { describe, expect, it } from 'vitest';
import { blankChart, parseChart, serializeChart, sortChart, type Chart, type Note } from './model';
import {
  changeNoteDirection,
  extendTap,
  flipNotes,
  setStepDistance,
  shiftNoteLanes,
} from './editing';
import { checkStepPositions } from './stepping';
import { demoChart } from './demo';

const tap = (id: string, direction: Note['direction'], timeMs: number, distance?: 1 | 2): Note => ({
  id,
  lane: 'step',
  direction,
  timeMs,
  kind: 'tap',
  ...(distance ? { distance } : {}),
});
const hold = (
  id: string,
  direction: Note['direction'],
  timeMs: number,
  endTimeMs: number,
  distance?: 1 | 2,
  modifier: 'none' | 'sway' = 'none',
): Note => ({ ...tap(id, direction, timeMs, distance), kind: 'hold', endTimeMs, modifier });
const chartOf = (notes: Note[]): Chart =>
  sortChart({ ...blankChart(), videoHint: { fileName: 'demo.mp4', durationMs: 20000 }, notes });

describe('STEP 合腿与跨度数据', () => {
  it('C、慢合腿、两格 TAP / 单脚 / SWAY 无损往返，旧 L/R 缺省一格', () => {
    const chart = chartOf([
      tap('legacy', 'left', 1000),
      tap('c', 'close', 1500),
      tap('r2', 'right', 2000, 2),
      hold('ch', 'close', 2500, 3000),
      hold('cs', 'close', 3100, 3500, undefined, 'sway'),
      hold('l2', 'left', 4000, 5000, 2),
      hold('r2s', 'right', 6000, 7000, 2, 'sway'),
    ]);
    expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
    expect(parseChart(chart).notes[0].distance).toBeUndefined();
  });
  it.each([
    { ...tap('c', 'close', 1000), lane: 'punch' },
    { ...tap('c', 'close', 1000), distance: 2 },
    { ...tap('l', 'left', 1000), distance: 0 },
    { ...tap('l', 'left', 1000), distance: 3 },
    { ...tap('l', 'left', 1000, 2), lane: 'punch' },
  ])('拒绝无法表达的 STEP 组合 %#', (note) => {
    expect(() => parseChart(chartOf([note as Note]))).toThrow();
  });
  it('反向和批量跨度编辑只影响 L/R，保留长条时间、SWAY 和 C', () => {
    const chart = chartOf([
      hold('l', 'left', 1000, 2000, 2, 'sway'),
      tap('c', 'close', 2500),
      tap('r', 'right', 3000),
      { ...tap('p', 'left', 4000), lane: 'punch' },
    ]);
    const ids = chart.notes.map((n) => n.id);
    const flipped = flipNotes(chart, ids);
    expect(flipped.notes[0]).toEqual({ ...chart.notes[0], direction: 'right' });
    expect(flipped.notes[1]).toEqual(chart.notes[1]);
    const changed = setStepDistance(chart, ids);
    expect(changed.notes[0]).toEqual({ ...chart.notes[0], distance: undefined });
    expect(changed.notes[2].distance).toBe(2);
    expect(changed.notes[1]).toEqual(chart.notes[1]);
    expect(changed.notes[3]).toEqual(chart.notes[3]);
    expect(setStepDistance(chart, ids, 2).notes[0]).toEqual(chart.notes[0]);
    expect(extendTap(chart, 'r', 3500, 20000).notes[2]).toMatchObject({
      kind: 'hold',
      direction: 'right',
    });
  });
  it('改成 C 清除跨度并保留 SWAY；C 和两格音符不能被拖到其他轨道丢失含义', () => {
    const chart = chartOf([
      hold('l', 'left', 1000, 2000, 2, 'sway'),
      tap('c', 'close', 2500),
      tap('r', 'right', 3000, 1),
    ]);
    const close = changeNoteDirection(chart.notes[0], 'close');
    expect(close).toEqual(hold('l', 'close', 1000, 2000, undefined, 'sway'));
    expect(shiftNoteLanes(chart, ['l'], 'step', 'punch')).toEqual(chart);
    expect(shiftNoteLanes(chart, ['c'], 'step', 'side_crunch')).toEqual(chart);
    const moved = shiftNoteLanes(chart, ['r'], 'step', 'punch');
    expect(moved.notes[2]).toMatchObject({ lane: 'punch', direction: 'right' });
    expect(moved.notes[2].distance).toBeUndefined();
    expect(() => parseChart(moved)).not.toThrow();
  });
});

describe('三格毯子站位检查', () => {
  it('C SWAY 可原地开始，不合腿或移动站位，保留后续 C 的收拢方向', () => {
    const chart = chartOf([
      hold('free', 'close', 0, 500, undefined, 'sway'),
      tap('l', 'left', 500),
      hold('open-free', 'close', 1000, 1500, undefined, 'sway'),
      tap('c', 'close', 1500),
      tap('r2', 'right', 2000, 2),
    ]);
    expect(checkStepPositions(chart)).toEqual([]);
    // Free swaying must not gather the right foot to the left, which would make this R legal.
    expect(
      checkStepPositions(
        chartOf([
          tap('l', 'left', 0),
          hold('free', 'close', 500, 1000, undefined, 'sway'),
          tap('out', 'right', 1000, 2),
        ]),
      ).map((i) => i.noteId),
    ).toEqual(['out']);
  });
  it('C SWAY 持续时间仍占用 STEP，结束点可衔接下一步', () => {
    expect(
      checkStepPositions(
        chartOf([
          hold('free', 'close', 0, 1000, undefined, 'sway'),
          tap('early', 'left', 500),
          tap('l', 'left', 1000),
          tap('c', 'close', 1500),
        ]),
      ).map((i) => i.noteId),
    ).toEqual(['early']);
  });
  it('L C R C R C L C 回中；从两侧跨两格可完成', () => {
    const directions: Note['direction'][] = [
      'left',
      'close',
      'right',
      'close',
      'right',
      'close',
      'left',
      'close',
    ];
    const chart = chartOf(directions.map((d, i) => tap(String(i), d, i * 500)));
    expect(checkStepPositions(chart)).toEqual([]);
    expect(
      checkStepPositions(
        chartOf([
          tap('l', 'left', 0),
          tap('c1', 'close', 500),
          tap('r2', 'right', 1000, 2),
          tap('c2', 'close', 1500),
          tap('l2', 'left', 2000, 2),
          tap('c3', 'close', 2500),
          tap('r', 'right', 3000),
          tap('c4', 'close', 3500),
        ]),
      ),
    ).toEqual([]);
  });
  it('中间两格越界、没有迈步的 C、连续向外迈步均明确提示且不改谱', () => {
    const chart = chartOf([
      tap('r2', 'right', 0, 2),
      tap('c', 'close', 500),
      tap('l', 'left', 1000),
      tap('l2', 'left', 1500),
    ]);
    const before = structuredClone(chart);
    expect(checkStepPositions(chart).map((i) => i.noteId)).toEqual(['r2', 'c', 'l2']);
    expect(chart).toEqual(before);
  });
  it('慢合腿到尾端才完成，STEP 不能在长条中间或同拍重叠', () => {
    const chart = chartOf([
      hold('l', 'left', 0, 500),
      hold('c', 'close', 500, 1500),
      tap('early', 'right', 1000),
      tap('r2', 'right', 1500, 2),
      tap('same', 'close', 1500),
      tap('c2', 'close', 2000),
    ]);
    expect(checkStepPositions(chart).map((i) => i.noteId)).toEqual(['early', 'same']);
  });
  it('示例谱包含完整动作并且全曲 STEP 站位合法', () => {
    const chart = demoChart('demo.mp4');
    expect(checkStepPositions(chart)).toEqual([]);
    expect(chart.notes.some((n) => n.direction === 'close' && n.kind === 'hold')).toBe(true);
    expect(chart.notes.some((n) => n.distance === 2)).toBe(true);
  });
});
