import { useCallback, useRef, type HTMLAttributes } from 'react';

const cards = '.mode-record, .collection-album, .record-card';

export function useCardHighlight() {
  const current = useRef<HTMLElement | null>(null);
  const source = useRef<'pointer' | 'keyboard'>('keyboard');
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const activate = useCallback(
    (card: HTMLElement | null, input: 'pointer' | 'keyboard' = 'keyboard') => {
      source.current = input;
      if (current.current === card) return;
      current.current?.removeAttribute('data-highlighted');
      current.current = card;
      card?.setAttribute('data-highlighted', '');
    },
    [],
  );
  const cardAt = (target: EventTarget | null, root: HTMLElement) => {
    const card = target instanceof Element ? target.closest<HTMLElement>(cards) : null;
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
    onFocusCapture: (event) => activate(cardAt(event.target, event.currentTarget)),
    onBlurCapture: (event) => {
      if (source.current === 'keyboard' && !event.currentTarget.contains(event.relatedTarget))
        activate(null);
    },
    onKeyDownCapture: (event) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key))
        activate(cardAt(event.target, event.currentTarget));
    },
  };
  return { activate, handlers };
}
