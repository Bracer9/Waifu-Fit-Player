import { useEffect } from 'react';

/** A brief hard-shadow press, composed with the cards' existing hover and music motion. */
export function useMenuCardPress(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const active = new Map<HTMLElement, Animation[]>();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const press = (event: MouseEvent) => {
      if (reduced.matches || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>(
        '.mode-record, .collection-album, .record-select',
      );
      if (!button?.closest('.menu-scene')) return;
      const card = button.matches('.record-select')
        ? button.closest<HTMLElement>('.record-card')
        : (button.querySelector<HTMLElement>('.mode-record-face') ?? button);
      if (!card) return;
      active.get(card)?.forEach((animation) => animation.cancel());
      const shadow = getComputedStyle(card).boxShadow;
      const motion = card.animate(
        [{ translate: '0px 0px' }, { translate: '0px 3px', offset: 0.3 }, { translate: '0px 0px' }],
        { duration: 150, easing: 'ease-out', composite: 'add' },
      );
      motion.id = 'menu-card-press';
      const depth = card.animate(
        [
          { boxShadow: shadow },
          { boxShadow: '2px 2px 0 #242329', offset: 0.3 },
          { boxShadow: shadow },
        ],
        { duration: 150, easing: 'ease-out' },
      );
      depth.id = 'menu-card-press-shadow';
      const animations = [motion, depth];
      active.set(card, animations);
      void Promise.all(animations.map((animation) => animation.finished))
        .then(() => {
          if (active.get(card) === animations) active.delete(card);
        })
        .catch(() => {});
    };
    const clear = () => {
      active.forEach((animations) => animations.forEach((animation) => animation.cancel()));
      active.clear();
    };
    document.addEventListener('click', press, true);
    reduced.addEventListener('change', clear);
    return () => {
      clear();
      document.removeEventListener('click', press, true);
      reduced.removeEventListener('change', clear);
    };
  }, [enabled]);
}
