import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { LANES, type Chart } from './model';
import { playerWarmupTimes } from './player-warmup';
import { READY_COUNTDOWN } from './ready-countdown';

/** Best-effort rendering through the real Player while the entrance is black.
 * Two RAFs allow a paint opportunity between samples, not a GPU completion fence.
 * No extra video, playback, seek, or second gameplay tree is involved.
 */
export function usePlayerRenderPreparation(
  chart: Chart,
  enabled: boolean,
  tracks: RefObject<HTMLElement | null>,
  onReady?: () => void,
  onProgress?: (value: number) => void,
) {
  const times = useMemo(() => playerWarmupTimes(chart), [chart]);
  const callback = useRef({ onReady, onProgress });
  callback.current = { onReady, onProgress };
  const [time, setTime] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let index = 0;
    let completed = 0;
    let samplingStage = false;
    const stage = tracks.current?.closest<HTMLElement>('.practice');
    const previousReady = stage?.getAttribute('data-ready');
    const startupTimes = [
      0,
      READY_COUNTDOWN.lightRiseMs / 2,
      READY_COUNTDOWN.lightRiseMs,
      READY_COUNTDOWN.laneSweepMs * 0.65,
      READY_COUNTDOWN.laneSweepMs + (LANES.length - 1) * READY_COUNTDOWN.laneStaggerMs,
    ];
    const total = times.length + startupTimes.length + 1;
    let startupAnimations: Animation[] = [];
    const report = () => callback.current.onProgress?.(++completed / total);
    const restoreStage = () => {
      if (!samplingStage || !stage) return;
      samplingStage = false;
      if (previousReady == null) stage.removeAttribute('data-ready');
      else stage.setAttribute('data-ready', previousReady);
      startupAnimations.forEach((animation) => animation.cancel());
    };
    const afterRenderOpportunity = (next: () => void) => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(next);
      });
    };
    const paintStartup = (sample: number) => {
      if (sample < startupTimes.length && stage) {
        if (!samplingStage) {
          samplingStage = true;
          // Sample only presentation behind the black entrance. The real
          // countdown stays waiting: no video seek/play, sounds or countdown timers.
          stage.setAttribute('data-ready', 'counting');
          startupAnimations = stage
            .getAnimations({ subtree: true })
            .filter(
              (animation) =>
                animation instanceof CSSAnimation && animation.animationName.startsWith('ready-'),
            );
          startupAnimations.forEach((animation) => animation.pause());
        }
        startupAnimations.forEach((animation) => (animation.currentTime = startupTimes[sample]));
        afterRenderOpportunity(() => {
          report();
          paintStartup(sample + 1);
        });
      } else {
        restoreStage();
        callback.current.onProgress?.(1);
        // Restore the real, paused opening frame before uncovering the stage.
        afterRenderOpportunity(() => {
          callback.current.onReady?.();
        });
      }
    };
    const paint = () => {
      if (index < times.length) {
        setTime(times[index++]);
        afterRenderOpportunity(() => {
          report();
          paint();
        });
      } else {
        setTime(null);
        afterRenderOpportunity(() => paintStartup(0));
      }
    };
    callback.current.onProgress?.(0);
    paint();
    return () => {
      cancelAnimationFrame(frame);
      restoreStage();
      setTime(null);
    };
  }, [enabled, times, tracks]);
  return enabled ? time : null;
}
