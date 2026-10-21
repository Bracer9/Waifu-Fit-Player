import { describe, expect, it } from 'vitest';
import {
  blankChart,
  parseChart,
  serializeChart,
  sortChart,
  noteColor,
  stepFoot,
  noteType,
  noteAction,
  type Chart,
  type Note,
} from './model';
import {
  changeNoteForm,
  extendTap,
  flipNotes,
  pasteEvents,
  setStepDistance,
  setStepFoot,
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
  modifier: 'none' | 'sway' = 'sway',
  distance?: 1 | 2,
): Note => ({ ...tap(id, direction, timeMs, distance), kind: 'hold', endTimeMs, modifier });
const chartOf = (notes: Note[]): Chart =>
  sortChart({ ...blankChart(), videoHint: { fileName: 'demo.mp4', durationMs: 20000 }, notes });
const STEP_VARIANTS = [
  ...(['left', 'right'] as const).flatMap((direction) =>
    (['tap', 'follow', 'follow-sway', 'hold', 'sway'] as const).map((type) => ({
      direction,
      type,
    })),
  ),
  { direction: 'free', type: 'sway' } as const,
];

describe('SIDE CRUNCH 独立用腿和方向', () => {
  it('左右腿可分别朝左右两个方向，TAP / HOLD / SWAY、反向、复制和存档均保留腿色', () => {
    for (const direction of ['left', 'right'] as const)
      for (const foot of ['left', 'right'] as const)
        for (const type of ['tap', 'hold', 'sway'] as const) {
          const original: Note = { ...tap('crunch', direction, 1000), lane: 'side_crunch' };
          const note = changeNoteForm(original, type, direction, 3000);
          const chart = setStepFoot(chartOf([note]), ['crunch'], foot);
          expect(noteColor('side_crunch', direction, undefined, undefined, foot)).toBe(
            foot === 'left' ? 'var(--cyan)' : 'var(--pink)',
          );
          expect(chart.notes[0]).toMatchObject({ direction, foot });
          const flipped = flipNotes(chart, ['crunch']);
          expect(flipped.notes[0]).toMatchObject({
            foot,
            direction: direction === 'left' ? 'right' : 'left',
          });
          expect(changeNoteForm(chart.notes[0], 'tap', direction, 4000).foot).toBe(foot);
          expect(parseChart(JSON.parse(serializeChart(flipped)))).toEqual(flipped);
          const pasted = pasteEvents(chart, chart.notes, [], 6000, 20000);
          expect(pasted.chart.notes.find((n) => pasted.ids.includes(n.id))).toMatchObject({
            lane: 'side_crunch',
            direction,
            foot,
            kind: chart.notes[0].kind,
          });
        }
  });
  it('旧谱面保留原本左右颜色，单独反向不再改变腿色', () => {
    for (const direction of ['left', 'right'] as const) {
      const note: Note = { ...tap('legacy', direction, 1000), lane: 'side_crunch' };
      const original = chartOf([note]);
      expect(parseChart(original)).toEqual(original);
      const color = noteColor(note.lane, direction);
      expect(color).toBe(direction === 'left' ? 'var(--cyan)' : 'var(--pink)');
      const flipped = flipNotes(original, ['legacy']).notes[0];
      expect(flipped.foot).toBe(direction);
      expect(noteColor(flipped.lane, flipped.direction, undefined, undefined, flipped.foot)).toBe(
        color,
      );
      expect(setStepFoot(original, ['legacy']).notes[0]).toMatchObject({
        direction,
        foot: direction === 'left' ? 'right' : 'left',
      });
      const changed = changeNoteForm(note, 'hold', direction === 'left' ? 'right' : 'left', 2000);
      expect(changed.foot).toBe(direction);
      const crossed = shiftNoteLanes(
        chartOf([{ ...note, foot: 'right' }]),
        ['legacy'],
        'side_crunch',
        'punch',
      );
      expect(crossed.notes[0].foot).toBeUndefined();
      expect(parseChart(crossed)).toEqual(crossed);
    }
  });
});

describe('统一 STEP 动作', () => {
  it('所有 STEP 类型的用脚颜色独立于方向，转换、反向和保存均保留', () => {
    for (const variant of STEP_VARIANTS) {
      const original = changeNoteForm(
        tap('n', 'left', 1000),
        variant.type,
        variant.direction,
        3000,
      );
      for (const foot of ['left', 'right', 'both'] as const) {
        const chart = setStepFoot(chartOf([original]), ['n'], foot);
        expect(chart.notes[0]).toEqual({ ...original, foot });
        expect(noteColor('step', original.direction, undefined, undefined, foot)).toBe(
          foot === 'both' ? 'var(--arms-both)' : foot === 'left' ? 'var(--cyan)' : 'var(--pink)',
        );
        expect(flipNotes(chart, ['n']).notes[0].foot).toBe(foot);
        for (const next of STEP_VARIANTS)
          expect(changeNoteForm(chart.notes[0], next.type, next.direction, 4000).foot).toBe(foot);
        expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
      }
      const swapped = setStepFoot(chartOf([original]), ['n']);
      expect(stepFoot(swapped.notes[0])).not.toBe(stepFoot(original));
      const both = setStepFoot(swapped, ['n']);
      expect(stepFoot(both.notes[0])).toBe('both');
      expect(stepFoot(setStepFoot(both, ['n']).notes[0])).toBe(stepFoot(original));
    }
    const crossed = shiftNoteLanes(
      chartOf([{ ...tap('n', 'left', 1000), foot: 'right' }]),
      ['n'],
      'step',
      'punch',
    );
    expect(crossed.notes[0].foot).toBeUndefined();
    expect(parseChart(crossed)).toEqual(crossed);
    for (const foot of ['any', null])
      expect(() => parseChart(chartOf([{ ...tap('n', 'left', 1000), foot } as Note]))).toThrow();
  });
  it('双脚紫色仅供 STEP，跨到侧收腹时清理，批量修改不写入无效腿色', () => {
    const original = chartOf([
      { ...tap('step', 'left', 1000), foot: 'both' },
      { ...tap('crunch', 'left', 2000), lane: 'side_crunch', foot: 'right' },
    ]);
    const batch = setStepFoot(original, ['step', 'crunch'], 'both');
    expect(batch.notes.map((note) => note.foot)).toEqual(['both', 'right']);
    expect(parseChart(batch)).toEqual(batch);
    const moved = shiftNoteLanes(original, ['step'], 'step', 'side_crunch');
    expect(moved.notes[0].foot).toBeUndefined();
    expect(parseChart(moved)).toEqual(moved);
    expect(() => parseChart(chartOf([{ ...original.notes[1], foot: 'both' }]))).toThrow();
  });
  it('STEP 动作互相转换，FOLLOW SWAY 保留 ID、起点和已有长条结束时间', () => {
    for (const from of STEP_VARIANTS)
      for (const to of STEP_VARIANTS) {
        const original = changeNoteForm(tap('n', 'left', 1000, 2), from.type, from.direction, 4000);
        const changed = changeNoteForm(original, to.type, to.direction, 1500);
        expect(changed).toMatchObject({
          id: 'n',
          lane: 'step',
          direction: to.direction,
          timeMs: 1000,
        });
        if (to.type === 'tap' || to.type === 'follow') {
          expect(changed.kind).toBe('tap');
          expect(changed).not.toHaveProperty('endTimeMs');
          expect(changed).not.toHaveProperty('modifier');
        } else {
          expect(changed).toMatchObject({
            kind: 'hold',
            modifier: to.type === 'sway' || to.type === 'follow-sway' ? 'sway' : 'none',
            endTimeMs: original.kind === 'hold' ? 4000 : 1500,
          });
        }
        expect(changed.follow).toBe(
          to.type === 'follow' || to.type === 'follow-sway' ? true : undefined,
        );
        if (to.direction === 'free' || to.type === 'follow' || to.type === 'follow-sway')
          expect(changed.distance).toBeUndefined();
        const chart = chartOf([changed]);
        expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
      }
  });
  it('FOLLOW SWAY 命名、复制和存档保留摇摆、方向、用脚与时长，不允许跨度或跨轨', () => {
    const note: Note = { ...hold('follow-sway', 'right', 1000, 3000), follow: true, foot: 'both' };
    const chart = chartOf([note]);
    expect(noteType(note)).toBe('follow-sway');
    expect(noteAction(note)).toBe('FOLLOW SWAY');
    expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
    expect(setStepDistance(chart, [note.id], 2)).toEqual(chart);
    expect(shiftNoteLanes(chart, [note.id], 'step', 'punch')).toEqual(chart);
    const pasted = pasteEvents(chart, chart.notes, [], 6000, 20000);
    expect(pasted.chart.notes.find((n) => pasted.ids.includes(n.id))).toMatchObject({
      ...note,
      id: expect.any(String),
      timeMs: 6000,
      endTimeMs: 8000,
    });
  });
  it('FOLLOW 可独立放置、反向与保存，不能拖成长条、加跨度或移到其他轨道', () => {
    const chart = chartOf([{ ...tap('follow', 'left', 713), follow: true }]);
    expect(checkStepPositions(chart)).toEqual([]);
    expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
    expect(flipNotes(chart, ['follow']).notes[0]).toMatchObject({
      direction: 'right',
      follow: true,
    });
    expect(extendTap(chart, 'follow', 2000, 20000)).toEqual(chart);
    expect(setStepDistance(chart, ['follow'], 2)).toEqual(chart);
    expect(shiftNoteLanes(chart, ['follow'], 'step', 'punch')).toEqual(chart);
  });
  it('旧 C、C HOLD、C SWAY 全部删除，不生成替代音符，不改动输入对象或现存动作', () => {
    const kept = hold('independent-free', 'free', 5000, 7000);
    const legacy = {
      ...chartOf([tap('left', 'left', 0), kept]),
      notes: [
        tap('left', 'left', 0),
        { ...tap('c', 'free', 500), direction: 'close' },
        { ...hold('ch', 'free', 1000, 2000, 'none'), direction: 'close' },
        { ...hold('cs', 'free', 2500, 4000), direction: 'close' },
        kept,
      ],
    };
    const before = structuredClone(legacy);
    const parsed = parseChart(legacy);
    expect(parsed.notes).toEqual([tap('left', 'left', 0), kept]);
    expect(legacy).toEqual(before);
    expect(serializeChart(parsed)).not.toContain('close');
  });
  it.each([
    tap('free-tap', 'free', 1000),
    hold('free-hold', 'free', 1000, 2000, 'none'),
    { ...hold('free-distance', 'free', 1000, 2000), distance: 2 },
    { ...hold('free-lane', 'free', 1000, 2000), lane: 'punch' },
    { ...tap('distance', 'left', 1000), distance: 3 },
    { ...tap('follow-distance', 'left', 1000, 2), follow: true },
    { ...tap('follow-lane', 'left', 1000), lane: 'punch', follow: true },
    { ...hold('follow-hold', 'left', 1000, 2000, 'none'), follow: true },
    { ...hold('follow-sway-distance', 'left', 1000, 2000, 'sway', 2), follow: true },
    { ...hold('follow-free', 'free', 1000, 2000), follow: true },
  ])('拒绝无效自由摇摆或跨度组合 %#', (note) => {
    expect(() => parseChart(chartOf([note as Note]))).toThrow();
  });
  it('反向、跨度与跨轨保留左右长条；FREE 不反向、不跨轨、不设置跨度', () => {
    const chart = chartOf([
      hold('l', 'left', 0, 1000, 'sway', 2),
      hold('f', 'free', 1000, 2000),
      tap('r', 'right', 2500),
    ]);
    expect(flipNotes(chart, ['l', 'f']).notes).toEqual([
      { ...chart.notes[0], direction: 'right', foot: 'left' },
      chart.notes[1],
      chart.notes[2],
    ]);
    expect(setStepDistance(chart, ['l', 'f'], 1).notes[0].distance).toBeUndefined();
    expect(setStepDistance(chart, ['f'], 2)).toEqual(chart);
    expect(shiftNoteLanes(chart, ['l', 'f'], 'step', 'punch')).toEqual(chart);
    expect(shiftNoteLanes(chart, ['r'], 'step', 'punch').notes[2]).toMatchObject({
      lane: 'punch',
      direction: 'right',
    });
  });
  it('只检查 STEP 时间冲突，不再依赖合腿推断站位', () => {
    const chart = chartOf([
      tap('a', 'left', 0),
      tap('b', 'left', 500),
      hold('f', 'free', 1000, 3000),
      tap('early', 'right', 1500),
      hold('long', 'left', 2000, 4000),
      tap('still-busy', 'right', 3500),
      tap('next', 'right', 4000),
    ]);
    const before = structuredClone(chart);
    expect(checkStepPositions(chart).map((i) => i.noteId)).toEqual(['early', 'long', 'still-busy']);
    expect(chart).toEqual(before);
  });
  it('示例只包含左右和独立 FREE SWAY，长条不冲突', () => {
    const chart = demoChart('demo.mp4');
    expect(parseChart(chart)).toEqual(chart);
    expect(checkStepPositions(chart)).toEqual([]);
    expect(chart.notes.some((n) => n.direction === 'free')).toBe(true);
    expect(chart.notes.some((n) => n.distance === 2)).toBe(true);
  });
});
