import { isPunchAction, type Note } from './model';

// Fixed once from the user's Sunlight chart: 507.2051 effort points ≈ 21 kcal.
// Other charts use the same conversion; their totals are not normalized to 21.
const KCAL_PER_EFFORT = 0.0414;

/** [Effort on arrival, effort per held second]. These are rough relative weights. */
function effortFor(note: Note): [number, number] {
  const sway = note.kind === 'hold' && note.modifier === 'sway';
  switch (note.lane) {
    case 'squat':
      return note.direction === 'down' ? [3, 2] : [1.5, 0];
    case 'calf_raise':
      return note.direction === 'up' ? [0.4, 0.25] : [0.2, 0];
    case 'punch':
      return [
        isPunchAction(note.lane, note.direction, note.armAction) ? 1.2 : 0.65,
        sway ? 0.65 : 0.25,
      ];
    case 'step':
      return [note.kind === 'tap' && note.follow ? 0.09 : 0.18, sway ? 0.2 : 0.55];
    case 'side_crunch':
      return [3, 1.2];
  }
}

type CaloriePoint = { timeMs: number; kcal: number; kcalPerMs: number };

/** Compile note arrivals and hold endings once, including simultaneous lanes. */
export function createCalorieIndex(notes: readonly Note[]): CaloriePoint[] {
  const changes = new Map<number, { effort: number; rate: number }>();
  const add = (timeMs: number, effort: number, rate: number) => {
    const previous = changes.get(timeMs);
    changes.set(timeMs, {
      effort: (previous?.effort ?? 0) + effort,
      rate: (previous?.rate ?? 0) + rate,
    });
  };
  for (const note of notes) {
    const [arrival, perSecond] = effortFor(note);
    const rate = note.kind === 'hold' && note.endTimeMs > note.timeMs ? perSecond / 1000 : 0;
    add(note.timeMs, arrival, rate);
    if (note.kind === 'hold' && rate) add(note.endTimeMs, 0, -rate);
  }
  let previousTime = 0;
  let effort = 0;
  let rate = 0;
  return [...changes]
    .sort(([a], [b]) => a - b)
    .map(([timeMs, change]) => {
      effort += (timeMs - previousTime) * rate + change.effort;
      rate = Math.max(0, rate + change.rate);
      previousTime = timeMs;
      return { timeMs, kcal: effort * KCAL_PER_EFFORT, kcalPerMs: rate * KCAL_PER_EFFORT };
    });
}

/** Stateless lookup: pause, seeks and replay follow the same media clock as notes. */
export function caloriesAt(index: readonly CaloriePoint[], timeMs: number): number {
  let low = 0;
  let high = index.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (index[mid].timeMs <= timeMs) low = mid + 1;
    else high = mid;
  }
  if (!low) return 0;
  const point = index[low - 1];
  // The final entry has no remaining holds; avoid extrapolating rounding residue.
  if (low === index.length) return point.kcal;
  return point.kcal + (timeMs - point.timeMs) * point.kcalPerMs;
}
