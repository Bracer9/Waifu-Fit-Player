import { isPunchAction, type Note } from './model';

export type DisplayNote = Note & { pairedPunch?: true; pairedReach?: string };

/** Pair matching punches and outward reaches for display; saved/scored notes stay intact. */
export function armDisplayNotes(notes: Note[], pairPunches = true): DisplayNote[] {
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    const punch = isPunchAction(note.lane, note.direction, note.armAction);
    if (punch && !pairPunches) continue;
    const spread =
      note.lane === 'punch' &&
      note.armAction === 'reach' &&
      ((note.direction === 'left' && note.hand === 'left') ||
        (note.direction === 'right' && note.hand === 'right'));
    if (!punch && !spread) continue;
    const key = `${punch ? 'punch' : 'spread'}:${note.timeMs}:${note.kind}:${note.kind === 'hold' ? `${note.endTimeMs}:${note.modifier}` : ''}`;
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }
  const paired = new Set<string>(),
    hidden = new Set<string>();
  const reaches = new Map<string, string>();
  for (const group of groups.values()) {
    const left = group.find((n) => n.direction === 'left');
    const right = group.find((n) => n.direction === 'right');
    if (left && right) {
      if (isPunchAction(left.lane, left.direction, left.armAction)) paired.add(left.id);
      else reaches.set(left.id, right.id);
      hidden.add(right.id);
    }
  }
  return notes
    .filter((n) => !hidden.has(n.id))
    .map((n) =>
      paired.has(n.id)
        ? { ...n, pairedPunch: true }
        : reaches.has(n.id)
          ? { ...n, pairedReach: reaches.get(n.id)! }
          : n,
    );
}

/** Saved notes stay separate; editor gestures select and edit the spread together. */
export function armEventIds(notes: Note[], id: string): string[] {
  const spread = armDisplayNotes(notes, false).find(
    (n) => n.pairedReach && (n.id === id || n.pairedReach === id),
  );
  return spread ? [spread.id, spread.pairedReach!] : [id];
}
