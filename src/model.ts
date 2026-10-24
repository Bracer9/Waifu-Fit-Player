import {
  CHART_TYPES,
  EXERCISE_INTENSITIES,
  migrateChartMetadata,
  type ChartType,
  type ExerciseIntensity,
} from './chart-types';

export const ARM_DIRECTIONS = [
  'up_left',
  'up',
  'up_right',
  'left',
  'right',
  'down_left',
  'down',
  'down_right',
] as const;
export type ArmAction = 'reach' | 'punch' | 'forward' | 'clap';
export type ArmHand = 'any' | 'left' | 'right' | 'both';
export type StepFoot = 'left' | 'right' | 'both';
export type SpinDirection = 'clockwise' | 'counterclockwise';
export const ARM_HANDS = [
  { value: 'any', label: 'ANY', color: 'var(--arms-any)' },
  { value: 'left', label: 'L', color: 'var(--cyan)' },
  { value: 'right', label: 'R', color: 'var(--pink)' },
  { value: 'both', label: 'BOTH', color: 'var(--arms-both)' },
] as const;
export const LANES = [
  { id: 'squat', name: '蹲起', english: 'SQUAT', directions: ['down', 'up'], color: 'var(--pink)' },
  {
    id: 'punch',
    name: '手臂',
    english: 'ARMS',
    directions: [...ARM_DIRECTIONS, 'forward'],
    color: 'var(--pink)',
  },
  {
    id: 'step',
    name: '踏步',
    english: 'STEP',
    directions: ['left', 'right', 'free'],
    color: 'var(--cyan)',
  },
  {
    id: 'calf_raise',
    name: '提踵',
    english: 'CALF RAISE',
    directions: ['up', 'down'],
    color: 'var(--miku)',
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
export type Direction = (typeof ARM_DIRECTIONS)[number] | 'free' | 'forward';
export type StepDistance = 1 | 2;
export type NoteType = 'tap' | 'hold' | 'sway' | 'follow' | 'follow-sway';
export const STEP_TYPES = [
  { value: 'tap', label: 'TAP' },
  { value: 'follow', label: 'FOLLOW' },
  { value: 'follow-sway', label: 'FOLLOW SWAY' },
  { value: 'hold', label: 'LEG HOLD' },
  { value: 'sway', label: 'SWAY' },
  // Keep the legacy option/data values so existing charts need no migration.
  { value: 'free-sway', label: 'SPIN' },
] as const;
export type Note = {
  id: string;
  lane: Lane;
  direction: Direction;
  timeMs: number;
  distance?: StepDistance;
  follow?: true;
  /** FOLLOW links to the preceding STEP unless explicitly disabled. */
  connectPrevious?: boolean;
  armAction?: ArmAction;
  hand?: ArmHand;
  foot?: StepFoot;
  /** Omitted in older charts: clockwise, matching the original SPIN icon. */
  spinDirection?: SpinDirection;
} & ({ kind: 'tap' } | { kind: 'hold'; endTimeMs: number; modifier: 'none' | 'sway' });
export type TempoSegment = { id: string; anchorMs: number; bpm: number; meter: '4/4' | '3/4' };
export type SpecialEvent = { id: string; timeMs: number; endTimeMs?: number };
/** Absolute video positions, independent of the chart's video/audio offset. */
export type PlayRange = { startMs: number; endMs: number };
export type Chart = {
  schemaVersion: 1;
  songId?: string;
  chartType?: ChartType;
  intensity?: ExerciseIntensity;
  danceDifficulty?: number;
  title: string;
  videoOffsetMs?: number;
  playRange?: PlayRange;
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
  free: 'SPIN',
  forward: 'FWD',
  up_left: '↖',
  up_right: '↗',
  down_left: '↙',
  down_right: '↘',
};
// Legacy charts used left/right on the punch lane for frontal punches.
export const isPunchAction = (lane: Lane, direction: Direction, action?: ArmAction) =>
  lane === 'punch' &&
  (action === undefined || action === 'punch') &&
  (direction === 'left' || direction === 'right');
export const armHand = (note: Pick<Note, 'lane' | 'direction' | 'armAction' | 'hand'>): ArmHand =>
  note.lane === 'punch' && note.armAction === 'clap'
    ? 'both'
    : isPunchAction(note.lane, note.direction, note.armAction)
      ? (note.direction as 'left' | 'right')
      : (note.hand ?? 'any');
export const armActionValue = (note: Pick<Note, 'lane' | 'direction' | 'armAction' | 'hand'>) =>
  note.armAction === 'clap'
    ? 'clap'
    : note.armAction === 'forward'
      ? `forward-${note.hand ?? 'left'}`
      : isPunchAction(note.lane, note.direction, note.armAction)
        ? `punch-${note.direction}`
        : note.direction;
export const stepFoot = (note: Pick<Note, 'direction' | 'foot'>): StepFoot =>
  note.foot ?? (note.direction === 'right' ? 'right' : 'left');
export const noteSymbol = (
  lane: Lane,
  direction: Direction,
  distance: StepDistance = 1,
  action?: ArmAction,
) =>
  lane === 'punch' && action === 'clap'
    ? 'CLAP'
    : isPunchAction(lane, direction, action)
      ? `PUNCH ${direction === 'left' ? 'L' : 'R'}`
      : lane === 'step'
        ? direction === 'free'
          ? 'SPIN'
          : `${direction === 'left' ? 'L' : 'R'}${distance === 2 ? '2' : ''}`
        : arrow[direction];
export const noteColor = (
  lane: Lane,
  direction: Direction,
  hand?: ArmHand,
  action?: ArmAction,
  foot?: StepFoot,
) =>
  lane === 'punch'
    ? ARM_HANDS.find(
        (item) => item.value === armHand({ lane, direction, hand, armAction: action }),
      )!.color
    : lane === 'step' || lane === 'side_crunch'
      ? stepFoot({ direction, foot }) === 'both'
        ? 'var(--arms-both)'
        : stepFoot({ direction, foot }) === 'left'
          ? 'var(--cyan)'
          : 'var(--pink)'
      : LANES.find((item) => item.id === lane)!.color;
export const isFollowStep = (note: Note) => note.lane === 'step' && note.follow === true;
export const isLegHold = (note: Note) =>
  note.lane === 'step' &&
  note.kind === 'hold' &&
  note.modifier === 'none' &&
  !isFollowStep(note) &&
  (note.direction === 'left' || note.direction === 'right');
export const isStepMove = (note: Note) =>
  note.lane === 'step' && note.direction !== 'free' && !isFollowStep(note);
export const noteType = (note: Note): NoteType =>
  isFollowStep(note)
    ? note.kind === 'hold'
      ? 'follow-sway'
      : 'follow'
    : note.kind === 'hold' && note.modifier === 'sway'
      ? 'sway'
      : note.kind;
export function noteTypeLabel(
  type: NoteType,
  lane: Lane | 'special',
  direction: Direction,
): string {
  if (type === 'follow') return 'FOLLOW';
  if (type === 'follow-sway') return 'FOLLOW SWAY';
  if (type === 'tap') return 'TAP';
  if (type === 'sway') return lane === 'step' && direction === 'free' ? 'SPIN' : 'SWAY';
  return lane === 'step' ? 'LEG HOLD' : 'HOLD';
}
export function noteAction(note: Note): string {
  if (note.lane === 'punch' && note.armAction === 'clap') return 'CLAP';
  if (isFollowStep(note))
    return note.kind === 'hold' ? 'FOLLOW SWAY' : `FOLLOW ${noteSymbol(note.lane, note.direction)}`;
  if (note.kind === 'tap' && note.lane === 'step')
    return `STEP ${noteSymbol(note.lane, note.direction, note.distance)}`;
  return noteTypeLabel(
    note.kind === 'hold' && note.modifier === 'sway' ? 'sway' : note.kind,
    note.lane,
    note.direction,
  );
}
export function specialMoveLabel(move: NonNullable<Chart['specialMove']>): string {
  // Preserve authored names in the chart; older bilingual names use their English part on stage.
  const english = [move.name, ...move.name.split(/[/／|]/)]
    .map((part) => part.trim())
    .find((part) => /^[\x20-\x7E]+$/.test(part) && /[a-z]/i.test(part));
  return (
    english?.toUpperCase() ??
    {
      heart: 'HEART POSE',
      star: 'STAR POSE',
      sparkles: 'SPARKLE POSE',
    }[move.icon]
  );
}
export function blankChart(title = '我的新作品'): Chart {
  return {
    schemaVersion: 1,
    chartType: 'dance',
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
export function parseChart(source: unknown, durationMs?: number): Chart {
  const errors: string[] = [];
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  if (!record(source)) throw new ChartError(['谱面必须是一个 JSON 对象。']);
  // Retired C actions are discarded, including their hold and sway variants.
  const input = migrateChartMetadata(
    Array.isArray(source.notes)
      ? {
          ...source,
          notes: source.notes.filter(
            (note) => !record(note) || note.lane !== 'step' || note.direction !== 'close',
          ),
        }
      : source,
  );
  if (input.schemaVersion !== 1)
    throw new ChartError(['不支持此谱面版本，当前仅支持 schemaVersion: 1。']);
  if (typeof input.title !== 'string' || !input.title.trim()) errors.push('作品名称不能为空。');
  if (
    input.songId !== undefined &&
    (typeof input.songId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.songId))
  )
    errors.push('曲目 ID 无效。');
  if (!CHART_TYPES.includes(input.chartType as ChartType))
    errors.push('谱面类型必须为 fitness 或 dance。');
  if (source.difficulty !== undefined && !['normal', 'hard'].includes(String(source.difficulty)))
    errors.push('旧谱面类型无效。');
  if (
    input.intensity !== undefined &&
    !EXERCISE_INTENSITIES.includes(input.intensity as ExerciseIntensity)
  )
    errors.push('运动强度必须为 low、medium 或 high。');
  if (
    input.danceDifficulty !== undefined &&
    (typeof input.danceDifficulty !== 'number' ||
      !Number.isFinite(input.danceDifficulty) ||
      input.danceDifficulty < 0)
  )
    errors.push('舞蹈难度必须为不小于 0 的数字。');
  if (
    input.videoOffsetMs !== undefined &&
    (!Number.isInteger(input.videoOffsetMs) || Math.abs(Number(input.videoOffsetMs)) > 1000)
  )
    errors.push('视频偏移必须是 -1000～1000 的整数毫秒。');
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
      !/^(?:[a-f0-9-]{36}|(?:demo|pack)-[a-f0-9]{64})$/.test(input.videoHint.assetId))
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
  if (input.playRange !== undefined) {
    const range = input.playRange;
    if (
      !record(range) ||
      !Number.isInteger(range.startMs) ||
      !Number.isInteger(range.endMs) ||
      Number(range.startMs) < 0 ||
      Number(range.endMs) <= Number(range.startMs) ||
      Number(range.endMs) > limit
    )
      errors.push('游玩区间无效：起止位置必须为视频范围内的整数毫秒，终点必须晚于起点。');
  }
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
        note.armAction !== undefined &&
        (note.lane !== 'punch' ||
          !['reach', 'punch', 'forward', 'clap'].includes(String(note.armAction)) ||
          (note.armAction === 'punch' && !['left', 'right'].includes(String(note.direction))) ||
          (note.armAction === 'forward' &&
            (note.direction !== 'forward' ||
              !['left', 'right', 'both'].includes(String(note.hand)))) ||
          (note.armAction === 'clap' &&
            (note.direction !== 'forward' ||
              note.hand !== 'both' ||
              (note.kind !== 'tap' && !(note.kind === 'hold' && note.modifier === 'none')))) ||
          (!['forward', 'clap'].includes(String(note.armAction)) && note.direction === 'forward'))
      )
        errors.push(
          `${label}：ARMS 拳套使用左右方向；前伸手掌指定用手；CLAP 支持双手 TAP／HOLD，使用 forward 方向。`,
        );
      if (note.direction === 'forward' && !['forward', 'clap'].includes(String(note.armAction)))
        errors.push(`${label}：forward 方向必须使用前伸手掌或拍手动作。`);
      if (
        note.hand !== undefined &&
        (note.lane !== 'punch' ||
          !ARM_HANDS.some((h) => h.value === note.hand) ||
          isPunchAction(
            note.lane as Lane,
            note.direction as Direction,
            note.armAction as ArmAction,
          ))
      )
        errors.push(`${label}：用手颜色仅适用于 ARMS 箭头，拳套的左右手由 L/R 决定。`);
      if (
        note.foot !== undefined &&
        ((note.lane !== 'step' && note.lane !== 'side_crunch') ||
          (note.foot !== 'left' &&
            note.foot !== 'right' &&
            !(note.lane === 'step' && note.foot === 'both')))
      )
        errors.push(
          `${label}：用脚／腿颜色仅适用于 STEP 或 SIDE CRUNCH；left／right 均可，both 仅适用于 STEP。`,
        );
      if (note.direction === 'free' && (note.kind !== 'hold' || note.modifier !== 'sway'))
        errors.push(`${label}：SPIN 必须是有时长的转圈动作。`);
      if (
        note.spinDirection !== undefined &&
        (note.lane !== 'step' ||
          note.direction !== 'free' ||
          !['clockwise', 'counterclockwise'].includes(String(note.spinDirection)))
      )
        errors.push(`${label}：旋转方向仅适用于 SPIN，必须为 clockwise 或 counterclockwise。`);
      if (
        note.follow !== undefined &&
        (note.follow !== true ||
          note.lane !== 'step' ||
          (note.kind !== 'tap' && !(note.kind === 'hold' && note.modifier === 'sway')) ||
          !['left', 'right'].includes(String(note.direction)) ||
          note.distance !== undefined)
      )
        errors.push(`${label}：FOLLOW 仅适用于 STEP 左右 TAP 或 SWAY，不设置跨度。`);
      if (
        note.connectPrevious !== undefined &&
        (typeof note.connectPrevious !== 'boolean' || note.follow !== true || note.lane !== 'step')
      )
        errors.push(`${label}：连接前一个音符仅适用于 FOLLOW，必须为布尔值。`);
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
