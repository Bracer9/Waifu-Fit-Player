import { describe, expect, it } from 'vitest';
import { blankChart, parseChart, serializeChart, type Chart, type Note } from './model';
import { gridLines, nextGrid, noteState, noteX, snapTime, specialAt } from './timing';
import { deleteEvents, historyReducer, moveEvents, pasteEvents, resnapEvents } from './editing';
import { demoChart } from './demo';
const segments: Chart['tempoSegments'] = [
  { id: 'a', anchorMs: 2000, bpm: 120, meter: '4/4' },
  { id: 'b', anchorMs: 34000, bpm: 150, meter: '3/4' },
  { id: 'c', anchorMs: 57300, bpm: 120, meter: '4/4' },
];
const hold: Note = {
  id: 'hold',
  lane: 'squat',
  direction: 'down',
  kind: 'hold',
  modifier: 'sway',
  timeMs: 12000,
  endTimeMs: 16000,
};
function fixture(): Chart {
  return structuredClone({
    ...blankChart(),
    videoHint: { fileName: 'dance.mp4', durationMs: 180000 },
    tempoSegments: segments,
    notes: [hold],
    specialMove: { name: 'HEART', icon: 'heart', previewBeats: 2 },
    specialEvents: [
      { id: 's1', timeMs: 48000, endTimeMs: 49600 },
      { id: 's2', timeMs: 112000 },
    ],
  });
}
describe('分段网格与绝对媒体时间', () => {
  it('120 BPM 整拍、半拍和录谱吸附', () => {
    expect(gridLines(segments, 2000, 3600, 1).map((l) => l.timeMs)).toEqual([
      2000, 2500, 3000, 3500,
    ]);
    expect(snapTime(12470, segments, 2)).toBe(12500);
    expect(snapTime(12470, segments, 0)).toBe(12470);
  });
  it('新段边界使用新网格，旧段不吸附到新段外', () => {
    expect(snapTime(34000, segments, 2)).toBe(34000);
    expect(snapTime(33990, segments, 2)).toBe(33750);
    expect(snapTime(34390, segments, 1)).toBe(34400);
    expect(snapTime(57300, segments, 1)).toBe(57300);
  });
  it('三拍子每三拍一个小节', () => {
    const lines = gridLines(segments, 34000, 37000, 2);
    expect(lines.filter((l) => l.type === 'bar').map((l) => l.timeMs)).toEqual([
      34000, 35200, 36400,
    ]);
  });
  it('锚点前无网格；终点吸附不越过视频', () => {
    expect(gridLines(segments, 0, 1999, 2)).toEqual([]);
    expect(snapTime(120, segments, 2)).toBe(120);
    expect(snapTime(2590, segments, 1, 2600)).toBe(2500);
    expect(nextGrid(33900, segments, 1, 180000)).toBe(34000);
  });
  it('跳入保持、回拖和结束是纯时间计算', () => {
    expect(noteState(hold, 11000)).toBe('waiting');
    expect(noteState(hold, 12000)).toBe('holding');
    expect(noteState(hold, 15500)).toBe('holding');
    expect(noteState(hold, 16000)).toBe('ended');
    expect(noteState(hold, 11000)).toBe('waiting');
  });
  it('未来音符在左，到时到框，HOLD 尾巴在头部左侧', () => {
    expect(noteX(12000, 10000, 400, 4000)).toBe(200);
    expect(noteX(12000, 12000, 400, 4000)).toBe(400);
    expect(noteX(16000, 12000, 400, 4000)).toBeLessThan(noteX(12000, 12000, 400, 4000));
  });
  it('SPECIAL 依据所在节拍段预告，持续到结束', () => {
    const chart = fixture();
    expect(specialAt(chart, 47199)).toBeNull();
    expect(specialAt(chart, 47200)?.active).toBe(false);
    expect(specialAt(chart, 48000)?.active).toBe(true);
    expect(specialAt(chart, 49599)?.active).toBe(true);
    expect(specialAt(chart, 49600)).toBeNull();
    expect(specialAt(chart, 112000)?.active).toBe(true);
  });
});
describe('谱面读写与校验', () => {
  it('完整往返保留保持、SWAY、分段以及重复 SPECIAL', () => {
    const chart = fixture();
    expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
  });
  it('演示谱能校验且覆盖整首', () => {
    const chart = demoChart('demo.mp4');
    expect(parseChart(chart)).toEqual(chart);
    expect(chart.notes.length).toBeGreaterThan(200);
    expect(chart.notes.at(-1)!.timeMs).toBeGreaterThan(240000);
  });
  it.each([
    [
      '未知版本',
      (c: any) => {
        c.schemaVersion = 99;
      },
    ],
    [
      '重复 ID',
      (c: any) => {
        c.notes[0].id = 'a';
      },
    ],
    [
      '非法 BPM',
      (c: any) => {
        c.tempoSegments[0].bpm = 0;
      },
    ],
    [
      '重复锚点',
      (c: any) => {
        c.tempoSegments[1].anchorMs = 2000;
      },
    ],
    [
      '方向不匹配',
      (c: any) => {
        c.notes[0].direction = 'left';
      },
    ],
    [
      '零长度 HOLD',
      (c: any) => {
        c.notes[0].endTimeMs = 12000;
      },
    ],
    [
      '负时间',
      (c: any) => {
        c.notes[0].timeMs = -1;
      },
    ],
    [
      '非整数时间',
      (c: any) => {
        c.notes[0].timeMs = 12000.5;
      },
    ],
    [
      '视频越界',
      (c: any) => {
        c.notes[0].endTimeMs = 180001;
      },
    ],
    [
      'SWAY 不能附在普通音符',
      (c: any) => {
        c.notes[0].kind = 'tap';
      },
    ],
    [
      '未定义 SPECIAL',
      (c: any) => {
        c.specialMove = null;
      },
    ],
    [
      '反向 SPECIAL',
      (c: any) => {
        c.specialEvents[0].endTimeMs = 47000;
      },
    ],
  ])('%s 明确拒绝', (_, mutate) => {
    const chart = fixture();
    mutate(chart);
    expect(() => parseChart(chart)).toThrow();
  });
  it('当前视频更短时保存失败，原谱未被修改', () => {
    const chart = fixture();
    const original = structuredClone(chart);
    expect(() => serializeChart(chart, 30000)).toThrow();
    expect(chart).toEqual(original);
  });
});
describe('编辑与历史', () => {
  it('整体移动保留 HOLD 时长并约束开始与结束', () => {
    const chart = fixture();
    const moved = moveEvents(chart, ['hold'], -20000, 180000);
    expect(moved.notes[0].timeMs).toBe(0);
    expect((moved.notes[0] as typeof hold).endTimeMs).toBe(4000);
    const end = moveEvents(chart, ['hold'], 999999, 180000).notes[0] as typeof hold;
    expect(end.endTimeMs).toBe(180000);
    expect(end.timeMs).toBe(176000);
  });
  it('复制拥有新 ID，保持相对时差和持续时间', () => {
    const chart = fixture();
    const result = pasteEvents(chart, chart.notes, chart.specialEvents.slice(0, 1), 20000, 180000);
    expect(
      new Set([...result.chart.notes, ...result.chart.specialEvents].map((n) => n.id)).size,
    ).toBe(5);
    expect(result.chart.notes[1].timeMs).toBe(20000);
    expect(result.chart.specialEvents[2].timeMs).toBe(56000);
  });
  it('批量删除只删除选中项，重新吸附是显式操作', () => {
    const chart = fixture();
    chart.notes[0].timeMs = 12470;
    expect(resnapEvents(chart, ['hold'], 2, 180000).notes[0].timeMs).toBe(12500);
    expect(chart.notes[0].timeMs).toBe(12470);
    expect(deleteEvents(chart, ['hold']).specialEvents).toEqual(chart.specialEvents);
  });
  it('撤销重做与分支编辑不会混合历史', () => {
    const original = fixture();
    const state = { past: [], present: original, future: [] };
    const edited = historyReducer(state, { type: 'edit', chart: { ...original, title: 'new' } });
    const undo = historyReducer(edited, { type: 'undo' });
    expect(undo.present.title).toBe(original.title);
    expect(historyReducer(undo, { type: 'redo' }).present.title).toBe('new');
    expect(
      historyReducer(undo, { type: 'edit', chart: { ...original, title: 'branch' } }).future,
    ).toEqual([]);
  });
  it('修改 BPM / Offset 不挪动音符', () => {
    const chart = fixture();
    const changed = {
      ...chart,
      tempoSegments: chart.tempoSegments.map((s, i) =>
        i === 0 ? { ...s, anchorMs: 3000, bpm: 180 } : s,
      ),
    };
    expect(parseChart(changed).notes).toEqual(chart.notes);
  });
});
