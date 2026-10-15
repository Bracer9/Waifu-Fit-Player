import { type Chart, type Note, noteSymbol } from './model';

export type StepIssue = { noteId: string; timeMs: number; message: string };

/** Three positions (left / centre / right), initially together in the centre.
 * An invalid cue is reported without silently moving either foot.
 */
export function checkStepPositions(chart: Chart): StepIssue[] {
  const notes = chart.notes
    .filter((note) => note.lane === 'step')
    .sort((a, b) => a.timeMs - b.timeMs);
  const issues: StepIssue[] = [];
  const feet = { left: 1, right: 1 };
  let lead: 'left' | 'right' | null = null;
  let busyUntil = -1;
  let lastStart = -1;
  const warn = (note: Note, message: string) =>
    issues.push({ noteId: note.id, timeMs: note.timeMs, message });
  for (const note of notes) {
    if (note.timeMs < busyUntil || note.timeMs === lastStart) {
      warn(note, '与前一个 STEP 动作重叠，请留出完成动作的时间。');
      continue;
    }
    lastStart = note.timeMs;
    // C SWAY is free swaying in place: neither foot nor the last lead foot changes.
    if (note.direction === 'close' && !(note.kind === 'hold' && note.modifier === 'sway')) {
      if (!lead || feet.left === feet.right) {
        warn(note, '当前已并腿，C 前需要一个 L/R 迈步。');
        continue;
      }
      feet.left = feet.right = feet[lead];
      lead = null;
    } else if (note.direction === 'left' || note.direction === 'right') {
      const target =
        feet[note.direction] + (note.direction === 'left' ? -1 : 1) * (note.distance ?? 1);
      if (target < 0 || target > 2) {
        warn(
          note,
          `${noteSymbol(note.lane, note.direction, note.distance)} 会超出三格毯子，请调整前面的站位或跨度。`,
        );
        continue;
      }
      feet[note.direction] = target;
      lead = note.direction;
    }
    // A C hold completes at its tail; intervening STEP cues are reported above.
    busyUntil = note.kind === 'hold' ? note.endTimeMs : note.timeMs;
  }
  return issues;
}
