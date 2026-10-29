import type { DisplayNote } from './armDisplay';

/** Immutable per-lane interval index. Reads have no forward-only cursor, so
 * seeking, warmup samples and chart edits use the same ordering and boundaries.
 */
export class PlayerNoteWindow {
  private readonly notes: readonly DisplayNote[];
  private readonly ends: Float64Array;
  private readonly leafCount: number;
  private readonly impactMs: number;

  constructor(notes: readonly DisplayNote[], impactMs: number) {
    this.notes = [...notes].sort((a, b) => a.timeMs - b.timeMs);
    this.impactMs = impactMs;
    let leaves = 1;
    while (leaves < notes.length) leaves *= 2;
    this.leafCount = leaves;
    this.ends = new Float64Array(leaves * 2).fill(-Infinity);
    this.notes.forEach((note, index) => {
      // Retain a finished hold for its release burst even after its body is gone.
      this.ends[leaves + index] = (note.kind === 'hold' ? note.endTimeMs : note.timeMs) + impactMs;
    });
    for (let node = leaves - 1; node > 0; node--)
      this.ends[node] = Math.max(this.ends[node * 2], this.ends[node * 2 + 1]);
  }

  read(time: number, previewMs: number) {
    const visible: DisplayNote[] = [];
    let holding: DisplayNote | undefined;
    let hit: DisplayNote | undefined;
    let release: DisplayNote | undefined;
    let nextTime = Infinity;
    const horizon = time + previewMs + 300;
    const visit = (node: number, start: number, end: number) => {
      if (
        start >= this.notes.length ||
        this.notes[start].timeMs > horizon ||
        this.ends[node] < time
      )
        return;
      if (end - start > 1) {
        const middle = (start + end) / 2;
        visit(node * 2, start, middle);
        visit(node * 2 + 1, middle, end);
        return;
      }
      const note = this.notes[start];
      const isVisible = note.kind === 'tap' || note.endTimeMs >= time;
      if (isVisible) {
        visible.push(note);
        if (note.timeMs > time) nextTime = Math.min(nextTime, note.timeMs);
        if (time >= note.timeMs && time - note.timeMs < this.impactMs) hit = note;
        if (note.kind === 'hold' && note.timeMs <= time && note.endTimeMs > time) holding = note;
      }
      // Traverse in start-time order, preserving the old overlap/tie priority.
      if (note.kind === 'hold' && time >= note.endTimeMs && time - note.endTimeMs < this.impactMs)
        release = note;
    };
    visit(1, 0, this.leafCount);
    return { visible, holding, hit, release, nextTime };
  }
}
