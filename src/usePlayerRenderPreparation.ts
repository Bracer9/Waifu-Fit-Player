import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Chart } from './model';
import { playerWarmupTimes } from './player-warmup';

/** Best-effort rendering through the real Player while the entrance is black.
 * Two RAFs allow a paint opportunity between samples, not a GPU completion fence.
 * No extra video, playback, seek, or second gameplay tree is involved.
 */
export function usePlayerRenderPreparation(chart: Chart, enabled: boolean, onReady?: () => void) {
  const times = useMemo(() => playerWarmupTimes(chart), [chart]);
  const callback = useRef(onReady);
  callback.current = onReady;
  const [time, setTime] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let index = 0;
    const afterRenderOpportunity = (next: () => void) => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(next);
      });
    };
    const paint = () => {
      if (index < times.length) {
        setTime(times[index++]);
        afterRenderOpportunity(paint);
      } else {
        setTime(null);
        // Restore the real, paused start frame before uncovering the stage.
        afterRenderOpportunity(() => callback.current?.());
      }
    };
    paint();
    return () => {
      cancelAnimationFrame(frame);
      setTime(null);
    };
  }, [enabled, times]);
  return enabled ? time : null;
}
