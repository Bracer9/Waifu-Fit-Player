import { isFollowStep, type Note } from './model';

/** One checkbox, one preceding STEP. Missing flags preserve the checked default. */
export function followConnections(notes: readonly Note[]) {
  const links: { previous: Note; follow: Note }[] = [];
  let previous: Note | undefined;
  for (const note of notes
    .filter((note) => note.lane === 'step')
    .sort((a, b) => a.timeMs - b.timeMs)) {
    if (
      isFollowStep(note) &&
      note.connectPrevious !== false &&
      previous &&
      previous.timeMs < note.timeMs
    )
      links.push({ previous, follow: note });
    previous = note;
  }
  return links;
}
