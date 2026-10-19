import { LANES, type Chart } from './model';
import { playableChart } from './play-range';

export const START_BRIEFING = {
  holdMs: 1150,
  releaseMs: 180,
  completionMs: 220,
} as const;

/** Count authored notes once each, regardless of tap/hold/sway shape. */
export function focusMoves(chart: Chart) {
  const notes = playableChart(chart).notes;
  const moves = LANES.map((lane) => {
    const count = notes.filter((note) => note.lane === lane.id).length;
    return { ...lane, count, share: notes.length ? count / notes.length : 0 };
  });
  const ranked = [...moves].filter((move) => move.count > 0).sort((a, b) => b.count - a.count);
  const prominent = new Set(
    ranked
      .filter((move, index) => index < 2 || (index === 2 && move.share >= 0.15))
      .map((move) => move.id),
  );
  return moves.map((move) => ({ ...move, prominent: prominent.has(move.id) }));
}

/** Read existing optional metadata without adding a new chart format or guessing credits. */
export function chartArtist(metadata: Chart & { artist?: unknown; author?: unknown }): string {
  return (
    [metadata.artist, metadata.author]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim() ?? '未标注'
  );
}
