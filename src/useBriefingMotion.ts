import { useLayoutEffect, useRef, type RefObject } from 'react';
import { BRIEFING_TEXTURES, START_BRIEFING as TIMING } from './start-briefing';
import { prepareAssets } from './asset-cache';

const POSTER = {
  maskSlant: 7,
  foldedScale: '0.08 0.7',
  closeScale: 0.965,
  bannerTravel: 72,
  neighborTravel: 22,
};

/** Reveal the existing printed panel as a whole, including its original grain. */
export function useBriefingMotion(
  root: RefObject<HTMLElement | null>,
  source: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const callback = useRef(onClose);
  callback.current = onClose;
  const controller = useRef({ ready: false, closing: false, close: () => {} });

  useLayoutEffect(() => {
    const section = root.current;
    const backdrop = section?.closest<HTMLElement>('.start-briefing-backdrop');
    const menu = source.current;
    if (!section || !backdrop || !menu) return;
    const shade = backdrop.querySelector<HTMLElement>('.briefing-shade')!;
    const board = section.querySelector<HTMLElement>('.briefing-board')!;
    const info = section.querySelector<HTMLElement>('.briefing-info')!;
    const banner = section.querySelector<HTMLElement>('.start-charge')!;
    const topline = section.querySelector<HTMLElement>('.briefing-topline')!;
    const cancel = section.querySelector<HTMLElement>('.briefing-cancel')!;
    const geometry = Array.from(section.querySelectorAll<HTMLElement>('.briefing-geometry > *'));
    const cards = Array.from(menu.querySelectorAll<HTMLElement>('.record-card'));
    const selected = cards.find((card) => card.getAttribute('aria-current') === 'true');
    const scroller = menu.querySelector<HTMLElement>('.song-carousel');
    const scrollOffset = scroller?.scrollLeft ?? 0;
    const originalSnap = scroller?.style.scrollSnapType ?? '';
    // Stop in-flight smooth scrolling, but retain the exact selection and offset.
    // Transformed neighbours must not become new native scroll-snap targets.
    if (scroller) {
      scroller.style.scrollSnapType = 'none';
      scroller.scrollTo({ left: scrollOffset, behavior: 'instant' });
    }
    const bounds = section.getBoundingClientRect();
    const cardBounds = selected?.getBoundingClientRect();
    const origin = cardBounds
      ? Math.max(
          25,
          Math.min(75, ((cardBounds.x + cardBounds.width / 2 - bounds.x) / bounds.width) * 100),
        )
      : 50;
    const collapsed = `polygon(${origin - POSTER.maskSlant}% -12%, ${origin - POSTER.maskSlant}% -12%, ${origin + POSTER.maskSlant}% 112%, ${origin + POSTER.maskSlant}% 112%)`;
    const revealed = 'polygon(-12% -12%, 112% -12%, 112% 112%, -12% 112%)';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const poster: Animation[] = [];
    const sourceMotion: Animation[] = [];
    const exits: Animation[] = [];
    const neighbors = cards
      .filter((card) => card !== selected)
      .map((card) => ({
        card,
        opacity: getComputedStyle(card).opacity,
        translate: getComputedStyle(card).translate,
        direction: card.offsetLeft < (selected?.offsetLeft ?? 0) ? -1 : 1,
      }));
    let alive = true;
    let closed = false;
    const controls = { ready: false, closing: false, close };
    controller.current = controls;
    menu.dataset.briefing = 'open';

    function animate(
      element: HTMLElement,
      frames: Keyframe[],
      duration: number,
      delay = 0,
      collection = poster,
      id = '',
      easing: string = TIMING.enterEase,
    ) {
      const animation = element.animate(frames, { duration, delay, easing, fill: 'both' });
      animation.id = id;
      collection.push(animation);
      return animation;
    }

    function ready() {
      if (!alive || controls.closing) return;
      // Remove temporary poses and masks before accepting charge input; the
      // underlying CSS is exactly the original resting panel.
      poster.forEach((animation) => animation.cancel());
      poster.length = 0;
      section!.dataset.motion = 'ready';
      controls.ready = true;
    }

    function completeClose() {
      if (!alive || closed) return;
      closed = true;
      callback.current();
    }

    function close() {
      if (controls.closing) return;
      controls.closing = true;
      controls.ready = false;
      [...poster, ...sourceMotion].forEach((animation) => {
        if (animation.playState === 'running') animation.pause();
      });
      section!.inert = true;
      if (reduced.matches) {
        completeClose();
        return;
      }
      // Read interrupted poses before writing. Early Esc must not flash a full panel.
      const panelPose = getComputedStyle(section!);
      const panel = { transform: panelPose.transform, opacity: panelPose.opacity };
      const boardClip = getComputedStyle(board).clipPath;
      const shadeOpacity = getComputedStyle(shade).opacity;
      const bannerPose = getComputedStyle(banner);
      const bar = { translate: bannerPose.translate, opacity: bannerPose.opacity };
      const shapes = geometry.map((element) => ({
        element,
        scale: getComputedStyle(element).scale,
      }));
      const returns = neighbors.map((item) => {
        const style = getComputedStyle(item.card);
        return { ...item, fromOpacity: style.opacity, fromTranslate: style.translate };
      });
      section!.dataset.motion = 'closing';
      animate(
        board,
        [{ clipPath: boardClip === 'none' ? revealed : boardClip }, { clipPath: collapsed }],
        170,
        0,
        exits,
      );
      animate(banner, [bar, { translate: '0 54px', opacity: 0 }], 120, 0, exits);
      shapes.forEach(({ element, scale }) =>
        animate(element, [{ scale }, { scale: POSTER.foldedScale }], 180, 0, exits),
      );
      animate(shade, [{ opacity: shadeOpacity }, { opacity: 0 }], TIMING.closeMs, 0, exits);
      returns.forEach(({ card, opacity, translate, fromOpacity, fromTranslate }) =>
        animate(
          card,
          [
            { opacity: fromOpacity, translate: fromTranslate },
            { opacity, translate },
          ],
          TIMING.closeMs,
          0,
          exits,
        ),
      );
      const exit = animate(
        section!,
        [panel, { transform: `scale(${POSTER.closeScale})`, opacity: 0 }],
        TIMING.closeMs,
        0,
        exits,
        'briefing-close',
        'cubic-bezier(0.4, 0, 0.8, 1)',
      );
      void exit.finished.then(completeClose).catch(() => {});
    }

    if (reduced.matches) ready();
    else {
      section.dataset.motion = 'opening';
      // Keep the CSS scale's resting origin throughout; changing it would move
      // the entire panel when the reveal hands back to the static layout.
      if (selected)
        animate(
          selected,
          [
            { scale: '1', offset: 0 },
            { scale: '0.965', offset: 0.35 },
            { scale: '1.025', offset: 0.7 },
            { scale: '1', offset: 1 },
          ],
          190,
          0,
          sourceMotion,
          'briefing-card-pop',
          'ease-out',
        );
      neighbors.forEach(({ card, direction, opacity }) =>
        animate(
          card,
          [
            { opacity, translate: '0 0' },
            { opacity: 0, translate: `${direction * POSTER.neighborTravel}px 0` },
          ],
          140,
          0,
          sourceMotion,
        ),
      );
      animate(shade, [{ opacity: 0 }, { opacity: 1 }], 380, 0, sourceMotion);
      geometry.forEach((element, index) => {
        animate(
          element,
          [
            { scale: POSTER.foldedScale, opacity: 0 },
            { scale: '1 1', opacity: 1 },
          ],
          440,
          40 + index * 45,
          poster,
          '',
          TIMING.revealEase,
        );
      });
      animate(
        board,
        [{ clipPath: collapsed }, { clipPath: revealed }],
        TIMING.revealMs,
        TIMING.revealDelayMs,
        poster,
        'briefing-poster-mask',
        TIMING.revealEase,
      );
      animate(
        info,
        [
          { opacity: 0, translate: '18px 0' },
          { opacity: 1, translate: '0 0' },
        ],
        TIMING.infoMs,
        TIMING.infoDelayMs,
      );
      animate(
        topline,
        [
          { opacity: 0, translate: '0 8px' },
          { opacity: 1, translate: '0 0' },
        ],
        180,
        270,
      );
      animate(cancel, [{ opacity: 0 }, { opacity: 1 }], 120, 570);
      animate(
        banner,
        [
          { opacity: 0, translate: `0 ${POSTER.bannerTravel}px` },
          { opacity: 1, translate: '0 0' },
        ],
        TIMING.openMs - TIMING.bannerDelayMs,
        TIMING.bannerDelayMs,
        poster,
        'briefing-banner-enter',
        'cubic-bezier(0.2, 0.7, 0.25, 1)',
      );
      // Reveal in place: never enlarge the whole panel and shrink it back at the end.
      void Promise.all(poster.map((animation) => animation.finished))
        .then(ready)
        .catch(() => {});
      // The printed cover is never revealed with a still-loading paper texture.
      // Usually this is already decoded while the song picker is entering.
      poster.forEach((animation) => {
        animation.pause();
        animation.currentTime = 0;
      });
      const cover = section.querySelector<HTMLImageElement>('.briefing-cover img')?.src;
      const materials = prepareAssets({
        images: [...BRIEFING_TEXTURES, ...(cover ? [cover] : [])],
      });
      const reveal = () => {
        if (!alive || controls.closing) return;
        section.dataset.material = 'ready';
        if (reduced.matches) ready();
        else poster.forEach((animation) => animation.play());
      };
      // A missing local asset retains the existing CSS fallback, never an input lock.
      void materials.then(reveal, reveal);
    }

    const preferenceChanged = () => {
      if (!reduced.matches) return;
      if (controls.closing) completeClose();
      else {
        sourceMotion.forEach((animation) => animation.cancel());
        ready();
      }
    };
    reduced.addEventListener('change', preferenceChanged);
    return () => {
      alive = false;
      if (controls.closing) {
        section.style.opacity = '0';
        shade.style.opacity = '0';
      }
      [...poster, ...sourceMotion, ...exits].forEach((animation) => animation.cancel());
      if (scroller) {
        const current = scroller.querySelector<HTMLElement>('.record-card[aria-current="true"]');
        if (current && current !== selected)
          current.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        else scroller.scrollTo({ left: scrollOffset, behavior: 'instant' });
        scroller.style.scrollSnapType = originalSnap;
      }
      delete menu.dataset.briefing;
      reduced.removeEventListener('change', preferenceChanged);
    };
  }, [root, source]);

  return {
    isReady: () => controller.current.ready && !controller.current.closing,
    isClosing: () => controller.current.closing,
    close: () => controller.current.close(),
  };
}
