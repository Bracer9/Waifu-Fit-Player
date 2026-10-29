import { describe, expect, it } from 'vitest';
import type { DisplayNote } from './armDisplay';
import { PlayerNoteWindow } from './player-note-window';

const impactMs = 520;
function reference(notes: DisplayNote[], time: number, previewMs: number) {
  const ordered = [...notes].sort((a, b) => a.timeMs - b.timeMs);
  const visible = ordered.filter(
    (n) =>
      n.timeMs <= time + previewMs + 300 &&
      (n.kind === 'hold' ? n.endTimeMs : n.timeMs + impactMs) >= time,
  );
  return {
    visible,
    holding: visible
      .filter((n) => n.kind === 'hold' && n.timeMs <= time && n.endTimeMs > time)
      .at(-1),
    hit: visible.filter((n) => time >= n.timeMs && time - n.timeMs < impactMs).at(-1),
    release: ordered
      .filter((n) => n.kind === 'hold' && time >= n.endTimeMs && time - n.endTimeMs < impactMs)
      .at(-1),
    nextTime: Math.min(...visible.filter((n) => n.timeMs > time).map((n) => n.timeMs)),
  };
}
const tap = (id: string, timeMs: number): DisplayNote => ({
  id,
  timeMs,
  lane: 'squat',
  direction: 'down',
  kind: 'tap',
});
const hold = (id: string, timeMs: number, endTimeMs: number): DisplayNote => ({
  id,
  timeMs,
  endTimeMs,
  lane: 'squat',
  direction: 'down',
  kind: 'hold',
  modifier: 'sway',
});

describe('PlayerNoteWindow', () => {
  it('matches the old scan at exact boundaries, overlaps, equal starts and backward seeks', () => {
    const notes = [
      hold('long', 0, 100000),
      tap('later', 3000),
      hold('a', 1000, 3000),
      hold('b', 1000, 2000),
      tap('junction', 2000),
      tap('tie', 2000),
      hold('c', 2100, 3000),
    ];
    const index = new PlayerNoteWindow(notes, impactMs);
    for (const preview of [600, 2160, 3600, 10000])
      for (const time of [
        0, 1000, 2000, 3000, 3520, 100520, 1000, -300, 999.5, 1999.5, 2000.5, 2999.5, 3519.5,
      ])
        expect(index.read(time, preview)).toEqual(reference(notes, time, preview));
  });

  it('keeps an old long hold while skipping expired and future blocks', () => {
    const notes = [
      hold('long', 0, 200000),
      ...Array.from({ length: 10000 }, (_, i) => tap(String(i), i * 20)),
    ];
    const index = new PlayerNoteWindow(notes, impactMs);
    for (const time of [190000, 10000, 100000, 0, 200520])
      expect(index.read(time, 2160)).toEqual(reference(notes, time, 2160));
  });

  it('matches mixed durations over deterministic random seek sequences and new chart indexes', () => {
    let seed = 1234;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const notes = Array.from({ length: 800 }, (_, i) => {
      const time = Math.floor(random() * 240000);
      return random() < 0.6
        ? tap(String(i), time)
        : hold(String(i), time, time + 1 + Math.floor(random() * 20000));
    });
    for (const source of [notes, notes.slice(40), []]) {
      const index = new PlayerNoteWindow(source, impactMs);
      for (let i = 0; i < 300; i++) {
        const time = random() * 270000 - 1000;
        const preview = 600 + random() * 10000;
        expect(index.read(time, preview)).toEqual(reference(source, time, preview));
      }
    }
  });
});
