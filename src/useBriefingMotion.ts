import { useLayoutEffect, useRef, type RefObject } from 'react';
import { START_BRIEFING } from './start-briefing';

/** Fade the complete paper card as one layer; its cover and texture never move separately. */
export function useBriefingMotion(root: RefObject<HTMLElement | null>, onClose: () => void) {
  const callback = useRef(onClose);
  callback.current = onClose;
  const controller = useRef({ closing: false, close: () => {} });

  useLayoutEffect(() => {
    const section = root.current;
    const backdrop = section?.closest<HTMLElement>('.start-briefing-backdrop');
    if (!section || !backdrop) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const animations: Animation[] = [];
    const originalOpacity = section.style.opacity;
    let paintFrame = 0;
    let alive = true;
    const controls = { closing: false, close };
    controller.current = controls;

    function fade(from: number, to: number, duration: number, element = section!) {
      const animation = element.animate([{ opacity: from }, { opacity: to }], {
        duration,
        easing: START_BRIEFING.enterEase,
        fill: 'both',
      });
      animations.push(animation);
      // Hold the exit endpoint until React removes the card; never restore its
      // underlying opacity between the last animation frame and unmount.
      return animation;
    }
    function close() {
      if (controls.closing) return;
      controls.closing = true;
      cancelAnimationFrame(paintFrame);
      animations.forEach((animation) => animation.pause());
      section!.inert = true;
      section!.dataset.motion = 'closing';
      if (reduced.matches) {
        callback.current();
        return;
      }
      // Close the card and its dark/blurred backdrop together. Fading only the
      // card leaves a dark full-screen layer behind until the unmount frame.
      const exit = fade(
        Number(getComputedStyle(backdrop!).opacity),
        0,
        START_BRIEFING.closeMs,
        backdrop!,
      );
      exit.id = 'briefing-close';
      void exit.finished
        .then(() => {
          if (alive) callback.current();
        })
        .catch(() => {});
    }

    if (reduced.matches) section.dataset.motion = 'ready';
    else {
      section.dataset.motion = 'opening';
      // Paint the paper and static blurred backdrop before starting the clock.
      // Otherwise their first raster can consume the entire visible fade.
      section.style.opacity = String(START_BRIEFING.prepareOpacity);
      const prepare = (frames: number) => {
        paintFrame = requestAnimationFrame(() => {
          if (!alive || controls.closing) return;
          if (frames > 1) {
            prepare(frames - 1);
            return;
          }
          const entrance = fade(START_BRIEFING.prepareOpacity, 1, START_BRIEFING.openMs);
          entrance.id = 'briefing-enter';
          void entrance.finished
            .then(() => {
              if (alive && !controls.closing) {
                section.dataset.motion = 'ready';
              }
            })
            .catch(() => {});
        });
      };
      prepare(START_BRIEFING.prepareFrames);
    }

    const finish = () => {
      cancelAnimationFrame(paintFrame);
      if (!animations.length && !controls.closing) {
        section.style.opacity = originalOpacity;
        section.dataset.motion = 'ready';
      }
      animations.forEach((animation) => animation.finish());
    };
    reduced.addEventListener('change', finish);
    return () => {
      alive = false;
      cancelAnimationFrame(paintFrame);
      if (controls.closing) {
        // Preserve transparency even while animation layers are being detached.
        backdrop.style.opacity = '0';
        section.style.opacity = '0';
      } else section.style.opacity = originalOpacity;
      animations.forEach((animation) => animation.cancel());
      reduced.removeEventListener('change', finish);
    };
  }, [root]);

  return {
    isClosing: () => controller.current.closing,
    close: () => controller.current.close(),
  };
}
