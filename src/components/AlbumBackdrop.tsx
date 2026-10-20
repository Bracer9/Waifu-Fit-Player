import { useEffect, useRef } from 'react';
import type { Album } from '../library';

const CATEGORY_NAMES: Record<string, string> = {
  all: 'ALL TRACKS',
  touhou: 'TOUHOU',
  anime: 'ANIME',
  vocaloid: 'VOCALOID',
  pop: 'POP',
};
const ACCENT_MOTION = { x: 5, y: 4, duration: 420 };

/** A quiet editorial backdrop; corner accents compose with the live music transform. */
export function AlbumBackdrop({ album, index }: { album: Album; index: number }) {
  const previous = useRef(index);
  const animations = useRef<Animation[]>([]);

  useEffect(() => {
    const direction = Math.sign(index - previous.current);
    previous.current = index;
    if (
      !direction ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.querySelector('.menu-app[data-album-player]') ||
      document.querySelector('.menu-curtain')
    )
      return;

    const next: Animation[] = [];
    for (const color of ['pink', 'cyan']) {
      const corner = document.querySelector<HTMLElement>(`.menu-app > .ambient-shape.${color}`);
      if (!corner) continue;
      // Keep this additive response off `translate`: the player uses that property
      // for its CSS slide. A WAAPI effect on it suppresses the first slide transition.
      corner
        .getAnimations()
        .filter((a) => a.id === 'album-accent')
        .forEach((a) => a.cancel());
      const sign = color === 'pink' ? direction : -direction;
      const motion = corner.animate(
        [
          { transform: 'translate(0px, 0px)' },
          {
            transform: `translate(${-sign * ACCENT_MOTION.x}px, ${sign * ACCENT_MOTION.y}px)`,
            offset: 0.32,
          },
          { transform: 'translate(0px, 0px)' },
        ],
        {
          duration: ACCENT_MOTION.duration,
          easing: 'cubic-bezier(0.22, 0.7, 0.2, 1)',
          composite: 'add',
        },
      );
      motion.id = 'album-accent';
      next.push(motion);
    }
    animations.current = next;
  }, [index]);

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const clear = () => animations.current.forEach((animation) => animation.cancel());
    reduced.addEventListener('change', clear);
    return () => {
      clear();
      reduced.removeEventListener('change', clear);
    };
  }, []);

  return (
    <div className="album-category" aria-hidden="true">
      <span key={album.id}>{CATEGORY_NAMES[album.id] ?? album.name.toUpperCase()}</span>
    </div>
  );
}
