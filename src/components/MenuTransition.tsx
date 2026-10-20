import { useLayoutEffect, useRef } from 'react';
import { MENU_TRANSITION } from '../menu-transition';

/** Fade through the persistent menu background; corners give a small directional cue. */
export function MenuTransition({
  phase,
  direction,
  onCovered,
  onRevealed,
}: {
  phase: 'cover' | 'hold' | 'reveal';
  direction: 'forward' | 'back';
  onCovered: () => void;
  onRevealed: () => void;
}) {
  const callbacks = useRef({ onCovered, onRevealed });
  callbacks.current = { onCovered, onRevealed };

  useLayoutEffect(() => {
    if (phase === 'hold') return;
    let alive = true;
    const animations: Animation[] = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const sign = direction === 'forward' ? 1 : -1;
    const covering = phase === 'cover';
    const timing: KeyframeAnimationOptions = {
      duration: reduced.matches ? 0 : covering ? MENU_TRANSITION.exitMs : MENU_TRANSITION.enterMs,
      delay: reduced.matches || covering ? 0 : MENU_TRANSITION.settleMs,
      easing: covering ? MENU_TRANSITION.exitEase : MENU_TRANSITION.enterEase,
      fill: 'both',
    };
    const scene = document.querySelector<HTMLElement>('.menu-app .menu-scene');
    if (scene) {
      const distance = sign * MENU_TRANSITION.contentDistance;
      const animation = scene.animate(
        covering
          ? [
              { opacity: 1, transform: 'translateX(0px)' },
              { opacity: 0, transform: `translateX(${-distance}px)` },
            ]
          : [
              { opacity: 0, transform: `translateX(${distance}px)` },
              { opacity: 1, transform: 'translateX(0px)' },
            ],
        timing,
      );
      animation.id = `menu-scene-${phase}`;
      animations.push(animation);
    }
    for (const color of ['cyan', 'pink'] as const) {
      const corner = document.querySelector<HTMLElement>(`.menu-app > .ambient-shape.${color}`);
      if (!corner) continue;
      const polarity = color === 'cyan' ? sign : -sign;
      const shift = `${polarity * MENU_TRANSITION.cornerX}px ${-polarity * MENU_TRANSITION.cornerY}px`;
      // Independent translate composes with the existing live BGM transform.
      // No snapshots, hidden copies, shape changes or teardown position resets.
      const animation = corner.animate(
        covering
          ? [{ translate: '0px 0px' }, { translate: shift }]
          : [{ translate: shift }, { translate: '0px 0px' }],
        timing,
      );
      animation.id = `menu-corner-${phase}-${color}`;
      animations.push(animation);
    }
    void Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        if (!alive) return;
        if (covering) callbacks.current.onCovered();
        else callbacks.current.onRevealed();
      })
      .catch(() => {});
    const finish = () => animations.forEach((animation) => animation.finish());
    window.addEventListener('resize', finish);
    reduced.addEventListener('change', finish);
    return () => {
      alive = false;
      animations.forEach((animation) => animation.cancel());
      window.removeEventListener('resize', finish);
      reduced.removeEventListener('change', finish);
    };
  }, [phase, direction]);

  // A transparent input guard. Persistent corners and gear remain visible throughout.
  return (
    <div
      className="menu-curtain"
      data-direction={direction}
      data-phase={phase}
      aria-hidden="true"
    />
  );
}
