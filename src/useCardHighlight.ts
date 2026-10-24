import { createContext, useCallback, useContext, useRef, type HTMLAttributes } from 'react';

const cards =
  '.mode-record, .collection-album, .record-card, .menu-settings, .headphone-button, .fit-log-trigger';

export function useMenuHighlight() {
  const current = useRef<HTMLElement | null>(null);
  const source = useRef<'pointer' | 'keyboard'>('keyboard');
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const activate = useCallback(
    (card: HTMLElement | null, input: 'pointer' | 'keyboard' = 'keyboard') => {
      source.current = input;
      if (current.current === card) {
        // A new pointer gesture can reopen an explicitly folded headphone menu.
        if (input === 'pointer')
          card?.dispatchEvent(new CustomEvent('menu-highlight-change', { detail: true }));
        return;
      }
      const previous = current.current;
      previous?.removeAttribute('data-highlighted');
      current.current = card;
      card?.setAttribute('data-highlighted', '');
      previous?.dispatchEvent(new CustomEvent('menu-highlight-change', { detail: false }));
      card?.dispatchEvent(new CustomEvent('menu-highlight-change', { detail: true }));
    },
    [],
  );
  const cardAt = (target: EventTarget | null, root: HTMLElement) => {
    if (!(target instanceof Element)) return null;
    const card =
      target.closest<HTMLElement>(cards) ??
      (target.closest('.music-panel, .music-panel-bridge')?.closest('.music-console[data-open]')
        ? root.querySelector<HTMLElement>('.headphone-button')
        : null) ??
      (target.closest('.corner-settings')
        ? root.querySelector<HTMLElement>('.menu-settings')
        : null) ??
      (target.closest('.fit-log-panel')
        ? root.querySelector<HTMLElement>('.fit-log-trigger')
        : null);
    return card && root.contains(card) ? card : null;
  };
  const handlers: HTMLAttributes<HTMLDivElement> = {
    onPointerMoveCapture: (event) => {
      const { clientX: x, clientY: y } = event;
      // Scrolling/animating under a stationary cursor must not steal keyboard focus.
      if (pointer.current?.x === x && pointer.current.y === y) return;
      pointer.current = { x, y };
      activate(cardAt(event.target, event.currentTarget), 'pointer');
    },
    onPointerDownCapture: (event) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      activate(cardAt(event.target, event.currentTarget), 'pointer');
    },
    onPointerLeave: () => {
      if (source.current === 'pointer') activate(null, 'pointer');
    },
    onFocusCapture: (event) => {
      if (source.current === 'keyboard' || event.target.matches(':focus-visible'))
        activate(cardAt(event.target, event.currentTarget));
    },
    onBlurCapture: (event) => {
      if (source.current === 'keyboard' && !event.currentTarget.contains(event.relatedTarget))
        activate(null);
    },
  };
  const getCurrent = useCallback(() => (current.current?.isConnected ? current.current : null), []);
  return { activate, getCurrent, handlers };
}

export const MenuHighlightContext = createContext<ReturnType<typeof useMenuHighlight> | null>(null);

export function useCardHighlight() {
  const shared = useContext(MenuHighlightContext);
  if (!shared) throw new Error('Menu highlight requires MenuHighlightContext.');
  return { activate: shared.activate, getCurrent: shared.getCurrent, handlers: {} };
}
