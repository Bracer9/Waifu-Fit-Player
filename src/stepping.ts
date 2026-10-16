import { type Chart } from './model';

export type StepIssue = { noteId: string; timeMs: number; message: string };

/** Check action conflicts, without inventing foot positions between authored moves. */
export function checkStepPositions(chart: Chart): StepIssue[] {
  const notes = chart.notes
    .filter((note) => note.lane === 'step')
    .sort((a, b) => a.timeMs - b.timeMs);
  const issues: StepIssue[] = [];
  let busyUntil = -1;
  let lastStart = -1;
  for (const note of notes) {
    if (note.timeMs < busyUntil || note.timeMs === lastStart) {
      issues.push({
        noteId: note.id,
        timeMs: note.timeMs,
        message: '与前一个 STEP 动作重叠，请留出完成动作的时间。',
      });
    }
    lastStart = note.timeMs;
    busyUntil = Math.max(busyUntil, note.kind === 'hold' ? note.endTimeMs : note.timeMs);
  }
  return issues;
}
