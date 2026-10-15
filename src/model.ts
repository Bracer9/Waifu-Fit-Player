export const LANES = [
  { id: 'squat', name: '蹲起', english: 'SQUAT', directions: ['down', 'up'], color: 'var(--pink)' },
  {
    id: 'calf_raise',
    name: '提踵',
    english: 'CALF RAISE',
    directions: ['up', 'down'],
    color: 'var(--miku)',
  },
  {
    id: 'punch',
    name: '出拳',
    english: 'PUNCH',
    directions: ['left', 'right'],
    color: 'var(--pink)',
  },
  {
    id: 'step',
    name: '踏步',
    english: 'STEP',
    directions: ['left', 'right', 'close'],
    color: 'var(--cyan)',
  },
  {
    id: 'side_crunch',
    name: '侧收腹',
    english: 'SIDE CRUNCH',
    directions: ['left', 'right'],
    color: 'var(--miku)',
  },
] as const;
export type Lane = (typeof LANES)[number]['id'];
export type Direction = 'up' | 'down' | 'left' | 'right' | 'close';
export type StepDistance = 1 | 2;
export type Note = {
  id: string;
  lane: Lane;
  direction: Direction;
  timeMs: number;
  distance?: StepDistance;
} & ({ kind: 'tap' } | { kind: 'hold'; endTimeMs: number; modifier: 'none' | 'sway' });
export type TempoSegment = { id: string; anchorMs: number; bpm: number; meter: '4/4' | '3/4' };
export type SpecialEvent = { id: string; timeMs: number; endTimeMs?: number };
export type Chart = {
  schemaVersion: 1;
  title: string;
  videoHint: { fileName: string; durationMs: number; assetId?: string };
  specialMove: { name: string; icon: 'heart' | 'star' | 'sparkles'; previewBeats: number } | null;
  tempoSegments: TempoSegment[];
  notes: Note[];
  specialEvents: SpecialEvent[];
};
export type Snap = 0 | 1 | 2 | 4;
export const uid = () => crypto.randomUUID();
export const arrow: Record<Direction, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  close: 'C',
};
export const noteSymbol = (lane: Lane, direction: Direction, distance: StepDistance = 1) =>
  lane === 'step'
    ? direction === 'close'
      ? 'C'
      : `${direction === 'left' ? 'L' : 'R'}${distance === 2 ? '2' : ''}`
    : arrow[direction];
export const noteColor = (lane: Lane, direction: Direction) =>
  lane === 'step'
    ? direction === 'close'
      ? 'var(--step-close)'
      : direction === 'left'
        ? 'var(--cyan)'
        : 'var(--pink)'
    : LANES.find((item) => item.id === lane)!.color;
export const isStepMove = (note: Note) => note.lane === 'step' && note.direction !== 'close';
export function noteAction(note: Note): string {
  if (note.lane !== 'step')
    return note.kind === 'hold' && note.modifier === 'sway' ? 'SWAY' : 'HOLD';
  if (note.direction === 'close')
    return note.kind === 'hold' ? (note.modifier === 'sway' ? '自由摇摆' : '慢速合腿') : '合腿';
  if (note.kind === 'tap')
    return `向${note.direction === 'left' ? '左' : '右'}迈${note.distance === 2 ? '两' : '一'}格`;
  return note.modifier === 'sway' ? '重心摇摆' : `${note.direction === 'left' ? '左' : '右'}脚支撑`;
}
export function blankChart(title = '我的新作品'): Chart {
  return {
    schemaVersion: 1,
    title,
    videoHint: { fileName: '', durationMs: 0 },
    specialMove: null,
    tempoSegments: [{ id: uid(), anchorMs: 0, bpm: 120, meter: '4/4' }],
    notes: [],
    specialEvents: [],
  };
}
export function sortChart(chart: Chart): Chart {
  return {
    ...chart,
    tempoSegments: [...chart.tempoSegments].sort((a, b) => a.anchorMs - b.anchorMs),
    notes: [...chart.notes].sort((a, b) => a.timeMs - b.timeMs),
    specialEvents: [...chart.specialEvents].sort((a, b) => a.timeMs - b.timeMs),
  };
}
export class ChartError extends Error {
  constructor(public issues: string[]) {
    super(issues.join('\n'));
    this.name = 'ChartError';
  }
}
export function parseChart(input: unknown, durationMs?: number): Chart {
  const errors: string[] = [];
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  if (!record(input)) throw new ChartError(['谱面必须是一个 JSON 对象。']);
  if (input.schemaVersion !== 1)
    throw new ChartError(['不支持此谱面版本，当前仅支持 schemaVersion: 1。']);
  if (typeof input.title !== 'string' || !input.title.trim()) errors.push('作品名称不能为空。');
  if (
    !record(input.videoHint) ||
    typeof input.videoHint.fileName !== 'string' ||
    !Number.isInteger(input.videoHint.durationMs) ||
    Number(input.videoHint.durationMs) < 0
  )
    errors.push('videoHint 的文件名或时长无效。');
  if (
    record(input.videoHint) &&
    input.videoHint.assetId !== undefined &&
    (typeof input.videoHint.assetId !== 'string' ||
      !/^(?:[a-f0-9-]{36}|demo-[a-f0-9]{64})$/.test(input.videoHint.assetId))
  )
    errors.push('videoHint 的视频关联 ID 无效。');
  const limit =
    durationMs || (record(input.videoHint) ? Number(input.videoHint.durationMs) : 0) || Infinity;
  const ids = new Set<string>();
  const checkId = (obj: Record<string, unknown>, label: string) => {
    if (typeof obj.id !== 'string' || !obj.id || ids.has(obj.id))
      errors.push(`${label}：ID 缺失或重复。`);
    else ids.add(obj.id);
  };
  const checkTime = (value: unknown, label: string) => {
    if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > limit)
      errors.push(`${label}：时间必须为视频范围内的非负整数毫秒。`);
  };
  if (!Array.isArray(input.tempoSegments) || !input.tempoSegments.length)
    errors.push('至少需要一个节拍段。');
  else {
    const anchors = new Set<number>();
    input.tempoSegments.forEach((seg, i) => {
      const label = `节拍段 ${i + 1}`;
      if (!record(seg)) {
        errors.push(`${label}：格式错误。`);
        return;
      }
      checkId(seg, label);
      checkTime(seg.anchorMs, `${label} Offset`);
      if (anchors.has(Number(seg.anchorMs))) errors.push(`${label}：第一拍位置重复。`);
      anchors.add(Number(seg.anchorMs));
      if (typeof seg.bpm !== 'number' || !Number.isFinite(seg.bpm) || seg.bpm <= 0)
        errors.push(`${label}：BPM 必须是大于 0 的有限数值。`);
      if (seg.meter !== '4/4' && seg.meter !== '3/4')
        errors.push(`${label}：拍号必须为 4/4 或 3/4。`);
    });
  }
  if (!Array.isArray(input.notes)) errors.push('notes 必须是数组。');
  else
    input.notes.forEach((note, i) => {
      const label = `音符 ${i + 1}`;
      if (!record(note)) {
        errors.push(`${label}：格式错误。`);
        return;
      }
      checkId(note, label);
      checkTime(note.timeMs, `${label} 起点`);
      const lane = LANES.find((l) => l.id === note.lane);
      if (!lane || !(lane.directions as readonly unknown[]).includes(note.direction))
        errors.push(`${label}：轨道或方向不匹配。`);
      if (
        note.distance !== undefined &&
        (note.lane !== 'step' ||
          !['left', 'right'].includes(String(note.direction)) ||
          (note.distance !== 1 && note.distance !== 2))
      )
        errors.push(`${label}：跨度仅适用于 STEP 的 L/R，必须为 1 或 2。`);
      if (note.kind === 'hold') {
        checkTime(note.endTimeMs, `${label} 终点`);
        if (Number(note.endTimeMs) <= Number(note.timeMs))
          errors.push(`${label}：HOLD 终点必须晚于起点。`);
        if (note.modifier !== 'none' && note.modifier !== 'sway')
          errors.push(`${label}：HOLD modifier 无效。`);
      } else if (note.kind !== 'tap' || 'modifier' in note || 'endTimeMs' in note)
        errors.push(`${label}：普通音符不能有保持属性。`);
    });
  if (input.specialMove !== null) {
    const sp = input.specialMove;
    if (
      !record(sp) ||
      typeof sp.name !== 'string' ||
      !sp.name.trim() ||
      !['heart', 'star', 'sparkles'].includes(String(sp.icon)) ||
      typeof sp.previewBeats !== 'number' ||
      !Number.isFinite(sp.previewBeats) ||
      sp.previewBeats <= 0 ||
      sp.previewBeats > 16
    )
      errors.push('SPECIAL 定义无效：需要名称、内置图标和 0～16 拍的预告长度。');
  }
  if (!Array.isArray(input.specialEvents)) errors.push('specialEvents 必须是数组。');
  else {
    if (input.specialEvents.length && !input.specialMove)
      errors.push('有 SPECIAL 事件，但没有定义本曲的标志性动作。');
    input.specialEvents.forEach((event, i) => {
      const label = `SPECIAL ${i + 1}`;
      if (!record(event)) {
        errors.push(`${label}：格式错误。`);
        return;
      }
      checkId(event, label);
      checkTime(event.timeMs, `${label} 起点`);
      if (event.endTimeMs !== undefined) {
        checkTime(event.endTimeMs, `${label} 终点`);
        if (Number(event.endTimeMs) <= Number(event.timeMs))
          errors.push(`${label}：终点必须晚于起点。`);
      }
    });
  }
  if (errors.length) throw new ChartError(errors);
  return sortChart(structuredClone(input) as Chart);
}
export function serializeChart(chart: Chart, durationMs?: number): string {
  return JSON.stringify(parseChart(chart, durationMs), null, 2);
}
