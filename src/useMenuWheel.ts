import { useEffect, type RefObject } from 'react';

const WHEEL_STEP = 120;
const SETTLE_DELAY = 100;
const RESPONSE_TIME = 75;

/** Accumulate wheel input without the browser snapping each notch back to its start. */
export function useMenuWheel(
  ref: RefObject<HTMLDivElement | null>,
  axis: 'x' | 'y',
  enabled: boolean,
) {
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const horizontal = axis === 'x';
    const offset = horizontal ? 'scrollLeft' : 'scrollTop';
    const size = horizontal ? 'clientWidth' : 'clientHeight';
    const extent = horizontal ? 'scrollWidth' : 'scrollHeight';
    const cardOffset = horizontal ? 'offsetLeft' : 'offsetTop';
    const cardSize = horizontal ? 'offsetWidth' : 'offsetHeight';
    const surface = horizontal ? (node.closest('.song-picker') ?? node) : node;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let target = 0;
    let position = 0;
    let lastInput = 0;
    let lastFrame = 0;
    let settled = false;
    let centers: number[] = [];
    const cancel = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      delete node.dataset.wheelScrolling;
    };
    const tick = (now: number) => {
      if (!settled && now - lastInput >= SETTLE_DELAY) {
        target = centers.reduce((nearest, center) =>
          Math.abs(center - target) < Math.abs(nearest - target) ? center : nearest,
        );
        settled = true;
      }
      const distance = target - position;
      const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-(now - lastFrame) / RESPONSE_TIME);
      position = Math.abs(distance) < 0.5 ? target : position + distance * blend;
      node[offset] = position;
      lastFrame = now;
      if (settled && Math.abs(target - position) < 0.5) {
        node[offset] = target;
        cancel();
      } else frame = requestAnimationFrame(tick);
    };
    const wheel = (event: WheelEvent) => {
      const input =
        horizontal && Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (
        event.ctrlKey ||
        !input ||
        (!horizontal && Math.abs(event.deltaX) > Math.abs(event.deltaY))
      )
        return;
      if (node.closest('.menu-scene[data-exit-to]')) return;
      event.preventDefault();
      if (!frame) {
        const max = Math.max(0, node[extent] - node[size]);
        centers = Array.from(node.children)
          .filter((child) => child.matches('.collection-album, .record-card'))
          .map((child) => {
            const card = child as HTMLElement;
            return Math.max(
              0,
              Math.min(max, card[cardOffset] + card[cardSize] / 2 - node[size] / 2),
            );
          });
        if (!centers.length) return;
        target = node[offset];
        position = target;
        node.dataset.wheelScrolling = '';
        node.scrollTo(
          horizontal
            ? { left: position, behavior: 'instant' }
            : { top: position, behavior: 'instant' },
        );
        lastFrame = performance.now();
        frame = requestAnimationFrame(tick);
      }
      const step = centers.length > 1 ? centers[1] - centers[0] : 0;
      const delta =
        input * (event.deltaMode === 1 ? WHEEL_STEP / 3 : event.deltaMode === 2 ? WHEEL_STEP : 1);
      if (Math.sign(delta) !== Math.sign(target - position)) target = position;
      // A standard wheel notch travels one card; fine touchpad deltas remain continuous.
      target = Math.max(
        centers[0],
        Math.min(centers.at(-1)!, target + (delta * step) / WHEEL_STEP),
      );
      lastInput = performance.now();
      settled = false;
    };
    surface.addEventListener('wheel', wheel as EventListener, { passive: false });
    surface.addEventListener('pointerdown', cancel);
    surface.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    window.addEventListener('resize', cancel);
    return () => {
      cancel();
      surface.removeEventListener('wheel', wheel as EventListener);
      surface.removeEventListener('pointerdown', cancel);
      surface.removeEventListener('touchstart', cancel);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('resize', cancel);
    };
  }, [ref, axis, enabled]);
}
