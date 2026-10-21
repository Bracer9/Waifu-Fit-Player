import { LANES, type Chart } from './model';
import { playableChart } from './play-range';

export const BRIEFING_TEXTURES = [
  '/art/cover-paper-grain.svg',
  '/art/cover-paper-ink.svg',
  '/art/cover-paper-fibers.svg',
  '/art/cover-paper-edges.svg',
];

export const START_BRIEFING = {
  holdMs: 1150,
  releaseMs: 180,
  completionMs: 420,
  openMs: 780,
  closeMs: 200,
  revealDelayMs: 110,
  revealMs: 460,
  infoDelayMs: 340,
  infoMs: 220,
  bannerDelayMs: 490,
  revealEase: 'cubic-bezier(0.35, 0, 0.25, 1)',
  enterEase: 'cubic-bezier(0.16, 1, 0.3, 1)',
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
