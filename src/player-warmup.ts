import type { Chart } from './model';

/** Sample actual arrival, sustain and release states, once per visual variant.
 * Values are chart times for drawing only; the media clock must remain paused.
 */
export function playerWarmupTimes(chart: Chart): number[] {
  const variants = new Set<string>();
  const times = new Set<number>();
  for (const note of chart.notes) {
    const key = JSON.stringify([
      note.lane,
      note.kind,
      note.direction,
      note.kind === 'hold' ? note.modifier : '',
      note.armAction,
      note.hand,
      note.foot,
    ]);
    if (variants.has(key)) continue;
    variants.add(key);
    times.add(
      note.timeMs + (note.kind === 'hold' ? Math.min(80, (note.endTimeMs - note.timeMs) / 2) : 80),
    );
    if (note.kind === 'hold') times.add(note.endTimeMs + 80);
    // Bound preparation work even on charts with every direction/hand variation.
    if (times.size >= 16) break;
  }
  const special = chart.specialEvents[0];
  if (special && chart.specialMove) {
    times.add(special.timeMs - 100);
    times.add(special.timeMs + 80);
    if (special.endTimeMs !== undefined) times.add(special.endTimeMs + 80);
  }
  return [...times];
}
