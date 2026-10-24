import warehouse from './bricks.json';
import {
  parseChart,
  sortChart,
  type Chart,
  type Note,
  type Lane,
  type Direction,
  type ArmAction,
  type ArmHand,
  type StepFoot,
} from '../model';
import { chartTimeAt, segmentAt } from '../timing';

export type PatternNote = {
  lane: string;
  direction: string;
  at: number;
  kind: string;
  duration?: number;
  modifier?: string;
  armAction?: string;
  hand?: string;
  foot?: string;
};
const signature = (notes: PatternNote[]) => JSON.stringify(notes);
export function normalizeFitnessPattern<
  T extends { notes: PatternNote[]; beats: number; label: string },
>(
  brick: T,
): Omit<T, 'notes'> & {
  notes: PatternNote[];
  beats: number;
  sourceBeats: number;
  leadingBeatsRemoved: number;
  label: string;
} {
  const leading = Math.min(...brick.notes.map((n) => n.at));
  let notes: PatternNote[] = brick.notes.map((n) => ({ ...n, at: n.at - leading }));
  // Window padding is provenance, not a required delay before the first action.
  // Keep the observed recovery space. Moving padding to the end must not
  // accidentally double workout density by shortening every source window.
  let beats = brick.beats;
  for (const candidate of [4, 8, 16]) {
    if (candidate >= beats || beats % candidate !== 0) continue;
    const first = notes.filter((n) => n.at < candidate);
    const repeated = Array.from({ length: beats / candidate }, (_, i) =>
      notes
        .filter((n) => n.at >= i * candidate && n.at < (i + 1) * candidate)
        .map((n) => ({ ...n, at: n.at - i * candidate })),
    );
    if (repeated.every((group) => signature(group) === signature(first))) {
      notes = first;
      beats = candidate;
      break;
    }
  }
  return {
    ...brick,
    notes,
    beats,
    sourceBeats: brick.beats,
    leadingBeatsRemoved: leading,
    label: brick.label.replace(/\d+小节/, `${beats / 4}小节`),
  };
}
export const fitnessPatterns = warehouse.bricks.map(normalizeFitnessPattern);
export type FitnessPattern = (typeof fitnessPatterns)[number];
export type PatternRequest = { id: string; repeats: number; mirror: boolean };
const mirrorDirection = (v: string) =>
  ({
    left: 'right',
    right: 'left',
    up_left: 'up_right',
    up_right: 'up_left',
    down_left: 'down_right',
    down_right: 'down_left',
  })[v] ?? v;
const swap = (v: string) => (v === 'left' ? 'right' : v === 'right' ? 'left' : v);
export function stampPattern(
  pattern: FitnessPattern,
  startMs: number,
  beatMs: number,
  repeats: number,
  mirror = false,
): Note[] {
  const result: Note[] = [];
  for (let i = 0; i < repeats; i++)
    for (const n of pattern.notes) {
      const mirrored = mirror !== (pattern.mirrorRequired && i % 2 === 1);
      const timeMs = Math.round(startMs + (i * pattern.beats + n.at) * beatMs);
      result.push({
        id: crypto.randomUUID(),
        lane: n.lane as Lane,
        direction: (mirrored ? mirrorDirection(n.direction) : n.direction) as Direction,
        timeMs,
        ...(n.armAction ? { armAction: n.armAction as ArmAction } : {}),
        ...(n.hand ? { hand: (mirrored ? swap(n.hand) : n.hand) as ArmHand } : {}),
        ...(n.foot ? { foot: (mirrored ? swap(n.foot) : n.foot) as StepFoot } : {}),
        ...(n.kind === 'hold'
          ? {
              kind: 'hold' as const,
              endTimeMs: Math.round(
                startMs + (i * pattern.beats + n.at + (n.duration ?? 1)) * beatMs,
              ),
              modifier: n.modifier as 'none' | 'sway',
            }
          : { kind: 'tap' as const }),
      });
    }
  return result;
}
export function patternBarTime(chart: Chart, timeMs: number) {
  const segment = segmentAt(chart.tempoSegments, timeMs) ?? chart.tempoSegments[0];
  const barMs = (60000 / segment.bpm) * (segment.meter === '3/4' ? 3 : 4);
  return Math.max(
    segment.anchorMs,
    Math.round(segment.anchorMs + Math.round((timeMs - segment.anchorMs) / barMs) * barMs),
  );
}
export function insertFitnessPattern(chart: Chart, request: PatternRequest, requestedTime: number) {
  if (chart.chartType !== 'fitness') throw new Error('积木插入仅用于 FITNESS 草稿。');
  const pattern = fitnessPatterns.find((p) => p.id === request.id);
  if (!pattern) throw new Error('未知的 Fitness 积木。');
  if (![1, 2, 4, 8].includes(request.repeats)) throw new Error('请选择 1／2／4／8 组。');
  const repeats = pattern.mirrorRequired && request.repeats === 1 ? 2 : request.repeats;
  const startMs = patternBarTime(chart, requestedTime),
    segment = segmentAt(chart.tempoSegments, startMs) ?? chart.tempoSegments[0];
  if (segment.meter !== '4/4') throw new Error('当前积木使用 4/4 拍，请在 4/4 段落插入。');
  const endMs = Math.round(startMs + (pattern.beats * repeats * 60000) / segment.bpm);
  const rangeStart = chartTimeAt(chart, chart.playRange?.startMs ?? 0),
    rangeEnd = chartTimeAt(chart, chart.playRange?.endMs ?? chart.videoHint.durationMs);
  if (startMs < rangeStart || endMs > rangeEnd)
    throw new Error('完整积木超出游玩区间，未插入或截断。');
  if (chart.tempoSegments.some((s) => s.anchorMs > startMs && s.anchorMs < endMs))
    throw new Error('积木跨越变速点，请在一个节拍段内插入。');
  if (
    chart.notes.some(
      (n) =>
        pattern.lanes.includes(n.lane) &&
        n.timeMs < endMs &&
        (n.kind === 'hold' ? n.endTimeMs > startMs : n.timeMs >= startMs),
    )
  )
    throw new Error('涉及轨道已有动作，未覆盖。请换到空白位置。');
  const notes = stampPattern(pattern, startMs, 60000 / segment.bpm, repeats, request.mirror);
  const next = parseChart(sortChart({ ...chart, notes: [...chart.notes, ...notes] }));
  return { chart: next, ids: notes.map((n) => n.id), endMs, startMs, repeats };
}
