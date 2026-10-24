import type { PatternNote } from './patterns';

export type MovementMode =
  | 'squat:tap'
  | 'squat:hold'
  | 'squat:sway'
  | 'punch:tap'
  | 'punch:hold'
  | 'punch:sway'
  | 'calf_raise:tap'
  | 'calf_raise:hold'
  | 'calf_raise:sway'
  | 'side_crunch:tap';
/** Return taps terminating a sustained movement are part of that movement,
 * rather than an independent TAP workout alongside it. */
export function movementModes(notes: readonly PatternNote[]) {
  return [
    ...new Set(
      notes
        .filter(
          (n) =>
            !(
              n.kind === 'tap' &&
              ['squat', 'calf_raise'].includes(n.lane) &&
              notes.some(
                (h) =>
                  h.lane === n.lane &&
                  h.kind === 'hold' &&
                  h.direction !== n.direction &&
                  Math.abs(h.at + (h.duration ?? 0) - n.at) < 0.02,
              )
            ),
        )
        .map(
          (n) =>
            `${n.lane}:${n.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'hold') : 'tap'}` as MovementMode,
        ),
    ),
  ].sort();
}
/** Occupied beats, not note counts. Concurrent lanes are counted separately. */
export function movementExposure(notes: readonly PatternNote[], beats: number) {
  const exposure: Record<string, number> = {};
  for (const n of notes) {
    const mode = `${n.lane}:${n.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'hold') : 'tap'}`;
    if (n.kind === 'hold')
      exposure[mode] =
        (exposure[mode] ?? 0) + Math.max(0, Math.min(beats, n.at + (n.duration ?? 0)) - n.at);
  }
  return exposure;
}
