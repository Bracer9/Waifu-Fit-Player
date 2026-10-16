import type { Chart, Note, TempoSegment } from './model';

type BeatSegment = { timeMs: number; beat: number; bpm: number };
const EPSILON = 1e-7;

/** Integrate tempo changes, including the 120 BPM lead-in before the first anchor. */
export function createBeatMap(segments: TempoSegment[]): BeatSegment[] {
  const map: BeatSegment[] = [{ timeMs: 0, beat: 0, bpm: 120 }];
  for (const segment of [...segments].sort((a, b) => a.anchorMs - b.anchorMs)) {
    const previous = map[map.length - 1];
    const next = {
      timeMs: segment.anchorMs,
      beat: previous.beat + ((segment.anchorMs - previous.timeMs) * previous.bpm) / 60000,
      bpm: segment.bpm,
    };
    if (segment.anchorMs === previous.timeMs) map[map.length - 1] = next;
    else map.push(next);
  }
  return map;
}

function beatAt(map: BeatSegment[], timeMs: number): number {
  let low = 0;
  let high = map.length;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (map[mid].timeMs <= timeMs) low = mid;
    else high = mid;
  }
  const segment = map[low];
  return segment.beat + ((timeMs - segment.timeMs) * segment.bpm) / 60000;
}

/** Compile spans, not individual ticks: even a very long hold needs only one entry. */
export function createComboIndex(chart: Chart) {
  const beats = createBeatMap(chart.tempoSegments);
  return {
    beats,
    notes: chart.notes.map((note) => {
      const startBeat = beatAt(beats, note.timeMs);
      return {
        timeMs: note.timeMs,
        endTimeMs: note.kind === 'hold' ? note.endTimeMs : undefined,
        startBeat,
        // Interior half-beats only. The tail always scores once, never twice.
        ticks:
          note.kind === 'hold'
            ? Math.max(0, Math.ceil((beatAt(beats, note.endTimeMs) - startBeat) * 2 - EPSILON) - 1)
            : 0,
      };
    }),
  };
}

/** Follow-along assumes full combo; media time is the sole source of truth. */
export function comboAt(index: ReturnType<typeof createComboIndex>, timeMs: number): number {
  const beat = beatAt(index.beats, timeMs);
  return index.notes.reduce((total, note) => {
    if (timeMs < note.timeMs) return total;
    if (note.endTimeMs === undefined) return total + 1;
    const ticks = Math.min(
      note.ticks,
      Math.max(0, Math.floor((beat - note.startBeat) * 2 + EPSILON)),
    );
    return total + 1 + ticks + Number(timeMs >= note.endTimeMs);
  }, 0);
}

/** A small receptor pulse on each scoring half-beat, frozen along with the media. */
export function sustainPulseAt(note: Note | undefined, timeMs: number, beats: BeatSegment[]) {
  if (!note || note.kind !== 'hold' || timeMs < note.timeMs || timeMs >= note.endTimeMs) return 0;
  const ticks = (beatAt(beats, timeMs) - beatAt(beats, note.timeMs)) * 2;
  const phase = Math.max(0, ticks - Math.floor(ticks + EPSILON));
  return Math.max(0, 1 - phase / 0.65) ** 2;
}
