import {
  LANES,
  isStepMove,
  isFollowStep,
  isPunchAction,
  ARM_HANDS,
  type ArmHand,
  type StepFoot,
  stepFoot,
  type Chart,
  type Direction,
  type Lane,
  type Note,
  type NoteType,
  type Snap,
  type StepDistance,
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
/** Extend an existing tap without moving its start, changing its direction, or creating another ID. */
export function extendTap(chart: Chart, id: string, endTimeMs: number, duration: number): Chart {
  const note = chart.notes.find((n) => n.id === id);
  const end = Math.round(clamp(endTimeMs, 0, duration));
  if (
    !note ||
    note.kind !== 'tap' ||
    isFollowStep(note) ||
    !Number.isFinite(end) ||
    end <= note.timeMs
  )
    return chart;
  return {
    ...chart,
    notes: chart.notes.map((n) =>
      n.id === id ? { ...note, kind: 'hold', modifier: 'none', endTimeMs: end } : n,
    ),
  };
}
export function flipNotes(chart: Chart, selected: string[]): Chart {
  const opposite: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
    free: 'free',
    up_left: 'down_right',
    up_right: 'down_left',
    down_left: 'up_right',
    down_right: 'up_left',
  };
  return {
    ...chart,
    notes: chart.notes.map((n) =>
      selected.includes(n.id) && n.direction !== 'free'
        ? {
            ...n,
            direction: opposite[n.direction],
            ...(n.lane === 'step' || n.lane === 'side_crunch' ? { foot: stepFoot(n) } : {}),
          }
        : n,
    ),
  };
}
export const nextArmHand = (hand: ArmHand = 'any'): ArmHand =>
  ARM_HANDS[(ARM_HANDS.findIndex((item) => item.value === hand) + 1) % ARM_HANDS.length].value;
/** Change hand without changing direction, timing, or sustain form. */
export function setArmHand(chart: Chart, selected: string[], hand?: ArmHand): Chart {
  return {
    ...chart,
    notes: chart.notes.map((note) => {
      if (
        !selected.includes(note.id) ||
        note.lane !== 'punch' ||
        isPunchAction(note.lane, note.direction, note.armAction)
      )
        return note;
      const next: Note = { ...note, hand: hand ?? nextArmHand(note.hand) };
      if (next.hand === 'any') delete next.hand;
      return next;
    }),
  };
}
export const nextStepFoot = (foot: StepFoot): StepFoot => (foot === 'left' ? 'right' : 'left');
/** STEP feet and SIDE CRUNCH legs share colour selection, independent of direction. */
export function setStepFoot(chart: Chart, selected: string[], foot?: StepFoot): Chart {
  return {
    ...chart,
    notes: chart.notes.map((note) =>
      selected.includes(note.id) && (note.lane === 'step' || note.lane === 'side_crunch')
        ? { ...note, foot: foot ?? nextStepFoot(stepFoot(note)) }
        : note,
    ),
  };
}
export function changeArmAction(note: Note, value: string): Note {
  if (note.lane !== 'punch') return note;
  const punch = value.startsWith('punch-');
  const next: Note = {
    ...note,
    armAction: punch ? 'punch' : 'reach',
    direction: (punch ? value.slice(6) : value) as Direction,
  };
  if (punch) delete next.hand;
  return next;
}
export function setStepDistance(chart: Chart, selected: string[], distance?: StepDistance): Chart {
  return {
    ...chart,
    notes: chart.notes.map((note) => {
      if (!selected.includes(note.id) || !isStepMove(note)) return note;
      const next = { ...note };
      const value = distance ?? (note.distance === 2 ? 1 : 2);
      if (value === 1) delete next.distance;
      else next.distance = value;
      return next;
    }),
  };
}
/** Change a note's action without replacing its ID or losing an existing sustain duration. */
export function changeNoteForm(
  note: Note,
  type: NoteType,
  direction: Direction,
  endTimeMs: number,
): Note {
  const base = {
    id: note.id,
    lane: note.lane,
    direction,
    timeMs: note.timeMs,
    ...(note.lane === 'punch' ? { armAction: note.armAction, hand: note.hand } : {}),
    ...(note.lane === 'step' || note.lane === 'side_crunch' ? { foot: stepFoot(note) } : {}),
    ...(note.lane === 'step' && direction !== 'free' && type !== 'follow' && note.distance
      ? { distance: note.distance }
      : {}),
  };
  if (type === 'follow' && note.lane === 'step' && (direction === 'left' || direction === 'right'))
    return { ...base, kind: 'tap', follow: true };
  if (type === 'tap' && direction !== 'free') return { ...base, kind: 'tap' };
  return {
    ...base,
    kind: 'hold',
    modifier: type === 'sway' || direction === 'free' ? 'sway' : 'none',
    endTimeMs: note.kind === 'hold' ? note.endTimeMs : endTimeMs,
  };
}
/** Preserve row spacing and only move to lanes that accept every selected note's direction. */
export function shiftNoteLanes(chart: Chart, selected: string[], from: Lane, to: Lane): Chart {
  const fromIndex = LANES.findIndex((l) => l.id === from);
  const toIndex = LANES.findIndex((l) => l.id === to);
  const delta = toIndex - fromIndex;
  if (!delta) return chart;
  const notes = chart.notes.filter((n) => selected.includes(n.id));
  if (
    notes.some((n) => {
      const index = LANES.findIndex((l) => l.id === n.lane);
      const next = index + delta;
      return (
        !(LANES[next]?.directions as readonly Direction[] | undefined)?.includes(n.direction) ||
        ((n.distance === 2 || isFollowStep(n)) && LANES[next]?.id !== 'step')
      );
    })
  )
    return chart;
  return {
    ...chart,
    notes: chart.notes.map((n) => {
      if (!selected.includes(n.id)) return n;
      const next = { ...n, lane: LANES[LANES.findIndex((l) => l.id === n.lane) + delta].id };
      if (next.lane !== 'step') {
        delete next.distance;
      }
      if (next.lane !== 'step' && next.lane !== 'side_crunch') delete next.foot;
      if (next.lane !== 'punch') {
        delete next.armAction;
        delete next.hand;
      } else if (n.lane !== 'punch') next.armAction = 'reach';
      return next;
    }),
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
