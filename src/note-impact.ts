import { noteColor } from './model';
import type { DisplayNote } from './armDisplay';

export const IMPACT_FRAMES = 32;
export const IMPACT_TINTS = ['pink', 'cyan', 'miku', 'neutral', 'both'] as const;
export function impactTint(note: DisplayNote): (typeof IMPACT_TINTS)[number] {
  const color = note.pairedPunch
    ? 'var(--arms-both)'
    : noteColor(note.lane, note.direction, note.hand, note.armAction, note.foot);
  if (color === 'var(--arms-both)') return 'both';
  if (color === 'var(--arms-any)') return 'neutral';
  if (color === 'var(--miku)') return 'miku';
  return color === 'var(--pink)' ? 'pink' : 'cyan';
}
