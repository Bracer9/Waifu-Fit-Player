import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ALBUM_DECK_TIMING } from './components/AlbumDeck';
import type { MenuSoundPlayer } from './useMenuSounds';
import { menuPortalRoot, menuRect, menuViewport } from './menu-viewport';

type Flight = {
  phase: 'inserting' | 'returning' | 'complete';
  animation: Animation;
  card: HTMLElement;
  copy: HTMLElement;
  mask: HTMLElement;
  visibility: string;
  opacity: string;
};

/** A click or Enter runs the insertion to completion; Escape and blur cancel it. */
export function useAlbumInsertion({
  menu,
  enabled,
  albumId,
  onComplete,
  onSound,
}: {
  menu: RefObject<HTMLElement | null>;
  enabled: boolean;
  albumId: string;
  onComplete: () => void;
  onSound: MenuSoundPlayer;
}) {
  const [inserting, setInserting] = useState(false);
  const flight = useRef<Flight | null>(null);
  const callbacks = useRef({ onComplete, onSound });
  callbacks.current = { onComplete, onSound };
  const dispose = () => {
    const current = flight.current;
    flight.current = null;
    if (!current) return;
    current.animation.cancel();
    current.mask.remove();
    current.card.style.visibility = current.visibility;
    current.card.style.opacity = current.opacity;
  };
  const release = () => {
    const current = flight.current;
    if (!current || current.phase !== 'inserting') return;
    current.phase = 'returning';
    current.copy.setAttribute('data-returning', '');
    const { translate, opacity } = getComputedStyle(current.copy);
    current.animation.cancel();
    current.animation = current.copy.animate(
      [
        { translate, opacity },
        { translate: '0 0', opacity: 1 },
      ],
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 1
          : ALBUM_DECK_TIMING.release,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        fill: 'forwards',
      },
    );
    void current.animation.finished
      .then(() => {
        if (flight.current !== current) return;
        dispose();
        setInserting(false);
      })
      .catch(() => {});
  };
  const begin = (quick = false) => {
    if (!enabled || flight.current) return;
    const card = menu.current?.querySelector<HTMLElement>('.album-shelf [aria-current="true"]');
    const slot = menu.current?.querySelector<HTMLElement>('.album-deck-slot');
    if (!card || !slot) return;
    const box = menuRect(card);
    const edge = menuRect(slot).left + 8;
    const mask = document.createElement('div');
    mask.className = 'album-flight';
    mask.style.clipPath = `inset(0 ${Math.max(0, menuViewport().width - edge)}px 0 0)`;
    const copy = card.cloneNode(true) as HTMLElement;
    copy.classList.add('album-flight-card');
    // Use the normal idle composition, including its persistent record layers.
    copy.querySelector('.collection-art')?.removeAttribute('data-cover-motion');
    // Cloned SVG references must not resolve to the original's now-hidden defs:
    // doing so drops the corrected record/mask and exposes the old cover below.
    const prefix = `album-flight-${crypto.randomUUID()}`;
    const ids = new Map<string, string>();
    for (const node of copy.querySelectorAll<SVGElement>('svg [id]')) {
      const next = `${prefix}-${node.id}`;
      ids.set(node.id, next);
      node.id = next;
    }
    for (const node of copy.querySelectorAll('svg [clip-path], svg [mask], svg [filter]')) {
      for (const attribute of ['clip-path', 'mask', 'filter']) {
        const value = node.getAttribute(attribute);
        if (value) {
          node.setAttribute(
            attribute,
            value.replace(/url\(#([^)]+)\)/g, (reference, id: string) =>
              ids.has(id) ? `url(#${ids.get(id)})` : reference,
            ),
          );
        }
      }
    }
    const duration = quick ? ALBUM_DECK_TIMING.quickInsert : ALBUM_DECK_TIMING.insert;
    copy.style.setProperty('--album-insert-ms', `${duration}ms`);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    Object.assign(copy.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    mask.append(copy);
    menuPortalRoot().append(mask);
    const visibility = card.style.visibility;
    const opacity = card.style.opacity;
    card.style.visibility = 'hidden';
    // The highlighted trace explicitly sets visibility: visible, overriding its
    // hidden parent. Fade the whole original subtree out while its copy moves.
    card.style.opacity = '0';
    const animation = copy.animate(
      matchMedia('(prefers-reduced-motion: reduce)').matches
        ? [{ opacity: 1 }, { opacity: 0.3 }]
        : [{ translate: '0 0' }, { translate: `${edge - box.left + 30}px 0` }],
      {
        duration,
        easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
        fill: 'forwards',
      },
    );
    const current: Flight = {
      phase: 'inserting',
      animation,
      card,
      copy,
      mask,
      visibility,
      opacity,
    };
    flight.current = current;
    setInserting(true);
    void animation.finished
      .then(() => {
        if (flight.current !== current || current.phase !== 'inserting') return;
        current.phase = 'complete';
        callbacks.current.onSound('insert');
        callbacks.current.onComplete();
      })
      .catch(() => {});
  };

  useLayoutEffect(() => {
    setInserting(false);
    return dispose;
  }, [enabled, albumId]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!flight.current || !['Enter', 'Escape', 'Backspace'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key !== 'Enter') release();
    };
    const blur = () => release();
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  });
  return { inserting, begin };
}
