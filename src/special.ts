import type { Chart, SpecialEvent } from './model';
import { clamp, segmentAt } from './timing';

export const SPECIAL_BURST_MS = 820;
export type SpecialVisual = {
  event: SpecialEvent;
  phase: 'flying' | 'holding' | 'burst';
  progress: number;
  remaining: number;
  /** Unclamped: negative means the release point is still outside the left edge. */
  tailProgress: number | null;
  bursts: { kind: 'arrival' | 'release'; progress: number }[];
};

/** Every cue is independent, including repeated/overlapping SPECIALs and seeks into a hold. */
export function specialVisualsAt(chart: Chart, timeMs: number): SpecialVisual[] {
  if (!chart.specialMove) return [];
  return chart.specialEvents.flatMap((event): SpecialVisual[] => {
    const bpm = segmentAt(chart.tempoSegments, event.timeMs)?.bpm ?? 120;
    const preview = (chart.specialMove!.previewBeats * 60000) / bpm;
    const flying = timeMs >= event.timeMs - preview && timeMs < event.timeMs;
    const holding =
      event.endTimeMs !== undefined && timeMs >= event.timeMs && timeMs < event.endTimeMs;
    const bursts: SpecialVisual['bursts'] = [];
    const arrival = timeMs - event.timeMs;
    if (arrival >= 0 && arrival < SPECIAL_BURST_MS)
      bursts.push({ kind: 'arrival', progress: arrival / SPECIAL_BURST_MS });
    if (event.endTimeMs !== undefined) {
      const release = timeMs - event.endTimeMs;
      if (release >= 0 && release < SPECIAL_BURST_MS)
        bursts.push({ kind: 'release', progress: release / SPECIAL_BURST_MS });
    }
    if (!flying && !holding && !bursts.length) return [];
    return [
      {
        event,
        phase: flying ? 'flying' : holding ? 'holding' : 'burst',
        progress: clamp((timeMs - event.timeMs + preview) / preview, 0, 1),
        remaining: holding ? (event.endTimeMs! - timeMs) / (event.endTimeMs! - event.timeMs) : 0,
        tailProgress:
          event.endTimeMs === undefined ? null : (timeMs - event.endTimeMs + preview) / preview,
        bursts,
      },
    ];
  });
}
