import { expect, it } from 'vitest';
import { followConnections } from './follow-connections';
import { blankChart, parseChart, serializeChart, type Note } from './model';
import { changeNoteForm, flipNotes, pasteEvents } from './editing';

const step = (id: string, timeMs: number, follow = false): Note => ({
  id,
  lane: 'step',
  kind: 'tap',
  direction: 'left',
  foot: 'right',
  timeMs,
  ...(follow ? { follow: true } : {}),
});

it('defaults to linking the preceding STEP, ignoring other lanes without gap or foot heuristics', () => {
  const first = step('first', 100);
  const next = step('next', 200);
  const follow = step('follow', 12000, true);
  const arms: Note = { id: 'arms', lane: 'punch', direction: 'right', kind: 'tap', timeMs: 11900 };
  const notes = [follow, arms, first, next];
  const before = [...notes];
  expect(followConnections(notes)).toEqual([{ previous: next, follow }]);
  expect(notes).toEqual(before);
});

it('only disables the unchecked FOLLOW and still uses it as the predecessor of the next one', () => {
  const first = step('first', 0, true);
  const disabled = { ...step('off', 1000, true), connectPrevious: false };
  const next: Note = { ...step('on', 2000, true), kind: 'hold', modifier: 'sway', endTimeMs: 3000 };
  expect(followConnections([first, disabled, next])).toEqual([
    { previous: disabled, follow: next },
  ]);
  expect(followConnections([first])).toEqual([]);
  expect(followConnections([step('a', 0), step('b', 0, true)])).toEqual([]);
});

it('keeps an unchecked FOLLOW through save, copy, flip and FOLLOW SWAY conversion, removing the flag for ordinary steps', () => {
  const follow = { ...step('follow', 1000, true), connectPrevious: false };
  const chart = {
    ...blankChart(),
    videoHint: { fileName: 'step.mp4', durationMs: 20000 },
    notes: [follow],
  };
  expect(parseChart(JSON.parse(serializeChart(chart))).notes[0].connectPrevious).toBe(false);
  expect(flipNotes(chart, [follow.id]).notes[0].connectPrevious).toBe(false);
  const pasted = pasteEvents(chart, chart.notes, [], 3000, 20000);
  expect(pasted.chart.notes.find((note) => pasted.ids.includes(note.id))?.connectPrevious).toBe(
    false,
  );
  const sway = changeNoteForm(follow, 'follow-sway', 'right', 2000);
  expect(sway.connectPrevious).toBe(false);
  expect(changeNoteForm(sway, 'follow', 'left', 2000).connectPrevious).toBe(false);
  expect(changeNoteForm(sway, 'tap', 'left', 2000).connectPrevious).toBeUndefined();
});

it('rejects nonboolean or orphaned connection flags while keeping existing FOLLOW charts compatible', () => {
  const base = { ...blankChart(), videoHint: { fileName: 'step.mp4', durationMs: 20000 } };
  expect(
    parseChart({ ...base, notes: [step('old', 1000, true)] }).notes[0].connectPrevious,
  ).toBeUndefined();
  expect(() =>
    parseChart({ ...base, notes: [{ ...step('invalid', 1000, true), connectPrevious: 'no' }] }),
  ).toThrow();
  expect(() =>
    parseChart({ ...base, notes: [{ ...step('invalid', 1000), connectPrevious: false }] }),
  ).toThrow();
});
