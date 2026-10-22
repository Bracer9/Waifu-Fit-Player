import type { Chart } from './model';
import { editionsIn, type ChartType, type Song } from './library';
import { playableChart, videoPlayRange } from './play-range';
import { createCalorieIndex } from './calories';
import { chartTimeAt, segmentAt } from './timing';
import type { MenuSoundPlayer } from './useMenuSounds';
import type { CSSProperties } from 'react';

export const AFTER_SHOW_FINISH = {
  tailMs: 300,
  metricsDelayMs: 450,
  metricsCountMs: 1800,
  bgmDelayMs: 700,
  confettiMs: 2300,
  piecesPerSide: 28,
} as const;

export const afterShowLightingStyle = {
  '--after-light-duration': `${AFTER_SHOW_FINISH.metricsDelayMs + AFTER_SHOW_FINISH.metricsCountMs}ms`,
} as CSSProperties;

/** Finish the last visual burst after the media clock stops, then enter After Show. */
export function beginAfterShowTail(onFrame: (progress: number) => void, onComplete: () => void) {
  const start = performance.now();
  let frame = 0;
  let last = -Infinity;
  const tick = (now: number) => {
    const progress = Math.min(1, Math.max(0, (now - start) / AFTER_SHOW_FINISH.tailMs));
    if (progress === 1 || now - last >= 1000 / 60) {
      onFrame(progress);
      last = now;
    }
    if (progress === 1) onComplete();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** Cancel both the finish accent and its pending music cue when leaving early. */
export function beginAfterShowAudio(onSound: MenuSoundPlayer, onMusic: () => void) {
  const stop = onSound('celebrate');
  const timer = setTimeout(onMusic, AFTER_SHOW_FINISH.bgmDelayMs);
  return () => {
    clearTimeout(timer);
    if (typeof stop === 'function') stop();
  };
}

export function afterShowSummary(chart: Chart, durationMs: number) {
  const range = videoPlayRange(chart, durationMs || chart.videoHint.durationMs);
  return {
    durationMs: Math.max(0, range.endMs - range.startMs),
    bpm:
      segmentAt(chart.tempoSegments, chartTimeAt(chart, range.startMs))?.bpm ??
      chart.tempoSegments[0]?.bpm,
    estimatedKcal: createCalorieIndex(playableChart(chart).notes).at(-1)?.kcal ?? 0,
  };
}

/** Match the song carousel order and stay inside the current album. */
export function nextAfterShowTrack(
  songs: Song[],
  albumId: string,
  songId: string | undefined,
  chartType: ChartType,
) {
  const available = songs
    .filter((song) => editionsIn(song, albumId).length)
    .sort(
      (a, b) =>
        (b.released.dance ?? b.released.fitness)!.updatedAt -
        (a.released.dance ?? a.released.fitness)!.updatedAt,
    );
  const current = available.findIndex((song) => song.id === songId);
  const next = Array.from(
    { length: available.length },
    (_, i) => available[(current + 1 + i) % available.length],
  ).find((song) => song.id !== songId);
  if (!next) return undefined;
  const types = editionsIn(next, albumId);
  return { song: next, chartType: types.includes(chartType) ? chartType : types.at(-1)! };
}

export function afterShowPadInput(pad: Pick<Gamepad, 'buttons' | 'axes'>) {
  const pressed = (index: number) => !!pad.buttons[index]?.pressed;
  const right = pressed(15) || pressed(13) || pad.axes[0] > 0.55 || pad.axes[1] > 0.55;
  const left = pressed(14) || pressed(12) || pad.axes[0] < -0.55 || pad.axes[1] < -0.55;
  return {
    direction: right === left ? 0 : right ? 1 : -1,
    confirm: pressed(0) || pressed(9),
    back: pressed(1) || pressed(8),
  };
}
