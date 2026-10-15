import {
  LANES,
  type Chart,
  type Direction,
  type Lane,
  type Note,
  type Snap,
  type SpecialEvent,
  sortChart,
  uid,
} from './model';
import { clamp, snapTime } from './timing';
export type History = { past: Chart[]; present: Chart; future: Chart[] };
export type HistoryAction =
  { type: 'edit'; chart: Chart } | { type: 'reset'; chart: Chart } | { type: 'undo' | 'redo' };
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === 'reset') return { past: [], present: sortChart(action.chart), future: [] };
  if (action.type === 'edit') {
    const chart = sortChart(action.chart);
    if (JSON.stringify(chart) === JSON.stringify(state.present)) return state;
    return { past: [...state.past.slice(-99), state.present], present: chart, future: [] };
  }
  if (action.type === 'undo' && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  if (action.type === 'redo' && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
export function deleteEvents(chart: Chart, selected: string[]): Chart {
  return {
    ...chart,
    notes: chart.notes.filter((n) => !selected.includes(n.id)),
    specialEvents: chart.specialEvents.filter((n) => !selected.includes(n.id)),
  };
}
export function flipNotes(chart: Chart, selected: string[]): Chart {
  const opposite: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  };
  return {
    ...chart,
    notes: chart.notes.map((n) =>
      selected.includes(n.id) ? { ...n, direction: opposite[n.direction] } : n,
    ),
  };
}
/** Preserve a multi-selection's row spacing; reject a row shift if any note leaves its axis pair. */
export function shiftNoteLanes(chart: Chart, selected: string[], from: Lane, to: Lane): Chart {
  const fromIndex = LANES.findIndex((l) => l.id === from);
  const toIndex = LANES.findIndex((l) => l.id === to);
  const delta = toIndex - fromIndex;
  if (!delta || Math.floor(fromIndex / 2) !== Math.floor(toIndex / 2)) return chart;
  const notes = chart.notes.filter((n) => selected.includes(n.id));
  if (
    notes.some((n) => {
      const index = LANES.findIndex((l) => l.id === n.lane);
      const next = index + delta;
      return next < 0 || next >= LANES.length || Math.floor(index / 2) !== Math.floor(next / 2);
    })
  )
    return chart;
  return {
    ...chart,
    notes: chart.notes.map((n) =>
      selected.includes(n.id)
        ? { ...n, lane: LANES[LANES.findIndex((l) => l.id === n.lane) + delta].id }
        : n,
    ),
  };
}
export function moveEvents(
  chart: Chart,
  selected: string[],
  delta: number,
  duration: number,
): Chart {
  const events = [...chart.notes, ...chart.specialEvents].filter((n) => selected.includes(n.id));
  if (!events.length) return chart;
  const start = Math.min(...events.map((e) => e.timeMs));
  const end = Math.max(
    ...events.map((e) => ('endTimeMs' in e ? (e.endTimeMs ?? e.timeMs) : e.timeMs)),
  );
  const offset = Math.round(clamp(delta, -start, Math.max(0, duration - end)));
  const move = <T extends Note | SpecialEvent>(e: T): T =>
    selected.includes(e.id)
      ? {
          ...e,
          timeMs: e.timeMs + offset,
          ...('endTimeMs' in e && e.endTimeMs !== undefined
            ? { endTimeMs: e.endTimeMs + offset }
            : {}),
        }
      : e;
  return { ...chart, notes: chart.notes.map(move), specialEvents: chart.specialEvents.map(move) };
}
export function pasteEvents(
  chart: Chart,
  notes: Note[],
  specials: SpecialEvent[],
  timeMs: number,
  duration: number,
): { chart: Chart; ids: string[] } {
  if (!notes.length && !specials.length) return { chart, ids: [] };
  const all = [...notes, ...specials];
  const origin = Math.min(...all.map((e) => e.timeMs));
  const end = Math.max(
    ...all.map((e) => ('endTimeMs' in e ? (e.endTimeMs ?? e.timeMs) : e.timeMs)),
  );
  const offset = Math.round(clamp(timeMs - origin, -origin, Math.max(-origin, duration - end)));
  const clone = <T extends Note | SpecialEvent>(e: T): T => ({
    ...e,
    id: uid(),
    timeMs: e.timeMs + offset,
    ...('endTimeMs' in e && e.endTimeMs !== undefined ? { endTimeMs: e.endTimeMs + offset } : {}),
  });
  const nn = notes.map(clone),
    ss = chart.specialMove ? specials.map(clone) : [];
  return {
    chart: {
      ...chart,
      notes: [...chart.notes, ...nn],
      specialEvents: [...chart.specialEvents, ...ss],
    },
    ids: [...nn, ...ss].map((n) => n.id),
  };
}
export function resnapEvents(
  chart: Chart,
  selected: string[],
  snap: Snap,
  duration: number,
): Chart {
  const snapEvent = <T extends Note | SpecialEvent>(e: T): T => {
    if (!selected.includes(e.id)) return e;
    const timeMs = snapTime(e.timeMs, chart.tempoSegments, snap, duration);
    if ('endTimeMs' in e && e.endTimeMs !== undefined) {
      const endTimeMs = snapTime(e.endTimeMs, chart.tempoSegments, snap, duration);
      return endTimeMs > timeMs ? { ...e, timeMs, endTimeMs } : e;
    }
    return { ...e, timeMs };
  };
  return {
    ...chart,
    notes: chart.notes.map(snapEvent),
    specialEvents: chart.specialEvents.map(snapEvent),
  };
}
