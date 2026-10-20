import type { Chart, PlayRange } from './model';
import { chartTimeAt } from './timing';

export const videoPlayRange = (chart: Chart, durationMs = chart.videoHint.durationMs): PlayRange =>
  chart.playRange ?? { startMs: 0, endMs: durationMs };

export function chartPlayRange(chart: Chart): PlayRange {
  const range = videoPlayRange(chart);
  return { startMs: chartTimeAt(chart, range.startMs), endMs: chartTimeAt(chart, range.endMs) };
}

export function playDuration(chart: Chart): number {
  const range = videoPlayRange(chart);
  return range.endMs - range.startMs;
}

/** Keep absolute note times; drafts and published snapshots retain all authored data. */
export function playableChart(chart: Chart): Chart {
  if (!chart.playRange) return chart;
  const { startMs, endMs } = chartPlayRange(chart);
  const inside = (event: { timeMs: number; endTimeMs?: number }) =>
    event.timeMs >= startMs && event.timeMs < endMs && (event.endTimeMs ?? event.timeMs) <= endMs;
  return {
    ...chart,
    notes: chart.notes.filter(inside),
    specialEvents: chart.specialEvents.filter(inside),
  };
}

export type RangeCrossing = { id: string; timeMs: number; endTimeMs: number; label: string };
export function playRangeCrossings(chart: Chart): RangeCrossing[] {
  if (!chart.playRange) return [];
  const { startMs, endMs } = chartPlayRange(chart);
  const crossing = (start: number, end: number) =>
    start < endMs && end > startMs && (start < startMs || end > endMs);
  return [
    ...chart.notes.flatMap((note) =>
      note.kind === 'hold' && crossing(note.timeMs, note.endTimeMs)
        ? [
            {
              id: note.id,
              timeMs: note.timeMs,
              endTimeMs: note.endTimeMs,
              label: note.modifier === 'sway' ? 'SWAY' : 'HOLD',
            },
          ]
        : [],
    ),
    ...chart.specialEvents.flatMap((event) =>
      event.endTimeMs !== undefined && crossing(event.timeMs, event.endTimeMs)
        ? [{ ...event, endTimeMs: event.endTimeMs, label: 'SPECIAL' }]
        : [],
    ),
  ].sort((a, b) => a.timeMs - b.timeMs);
}

/** Video positions accept mm:ss.mmm or decimal seconds, never musical bar numbers. */
export function parsePlayTime(value: string): number | undefined {
  const text = value.trim();
  const time = /^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/.exec(text);
  if (time)
    return (
      Number(time[1]) * 60000 + Number(time[2]) * 1000 + Number((time[3] ?? '').padEnd(3, '0'))
    );
  if (/^\d+(?:\.\d{1,3})?$/.test(text)) return Math.round(Number(text) * 1000);
  return undefined;
}
