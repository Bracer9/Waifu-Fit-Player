import { isPunchAction, type Note } from './model';

export type DisplayNote = Note & { pairedPunch?: true };

/** Pair matching frontal punches for display only; timing, scoring and saved notes stay intact. */
export function armDisplayNotes(notes: Note[]): DisplayNote[] {
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    if (!isPunchAction(note.lane, note.direction, note.armAction)) continue;
    const key = `${note.timeMs}:${note.kind}:${note.kind === 'hold' ? `${note.endTimeMs}:${note.modifier}` : ''}`;
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }
  const paired = new Set<string>(),
    hidden = new Set<string>();
  for (const group of groups.values()) {
    const left = group.find((n) => n.direction === 'left');
    const right = group.find((n) => n.direction === 'right');
    if (left && right) {
      paired.add(left.id);
      hidden.add(right.id);
    }
  }
  return notes
    .filter((n) => !hidden.has(n.id))
    .map((n) => (paired.has(n.id) ? { ...n, pairedPunch: true } : n));
}
