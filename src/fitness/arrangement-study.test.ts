import { describe, expect, it } from 'vitest';
import {
  alignStructure,
  musicalBars,
  type StudyTrack,
  type StructureStudy,
} from './arrangement-study';

describe('offline arrangement music evidence', () => {
  const grid = { bpm: 120, anchorMs: 100, audioStartMs: 100, endMs: 20100 };
  const structure: StructureStudy = {
    sections: [
      { startMs: 0, endMs: 7850, label: 'verse' },
      { startMs: 7850, endMs: 10850, label: 'pre-chorus' },
      { startMs: 10850, endMs: 20100, label: 'chorus' },
    ],
    beatTimes: [],
    embedding: [],
  };
  const track = {
    title: 'unseen',
    base: { notes: [] },
    levels: Array(4100).fill(0.5),
    onsets: Array(4100).fill(0.2),
    spectrum: { rate: 10, frames: [] },
  } as unknown as StudyTrack;

  it('places a between-beat split on the following beat, retaining a two-beat pickup', () => {
    const aligned = alignStructure(structure, grid);
    expect(aligned[1].startMs).toBe(8100);
    expect(aligned[2].startMs).toBe(11100);
    const bars = musicalBars(track, structure, grid);
    expect(bars.find((b) => b.function === 'chorus')?.startMs).toBe(11100);
    expect(bars.find((b) => b.startMs === 10100)).toMatchObject({ endMs: 11100, partial: true });
    for (let i = 1; i < bars.length; i++) expect(bars[i].startMs).toBe(bars[i - 1].endMs);
  });

  it('does not take exercise or tempo answers from an unseen target draft', () => {
    const expected = musicalBars(track, structure, grid);
    const contaminated = {
      ...track,
      base: {
        ...track.base,
        notes: [{ lane: 'squat', direction: 'down', kind: 'hold', timeMs: 0, endTimeMs: 20000 }],
        tempoSegments: [{ bpm: 999, anchorMs: 19000 }],
      },
    } as unknown as StudyTrack;
    expect(musicalBars(contaminated, structure, grid)).toEqual(expected);
  });
});
