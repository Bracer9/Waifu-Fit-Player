import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type FocusEvent,
  type RefObject,
} from 'react';
import type { MenuMusic } from './useMenuMusic';
import type { MenuSoundPlayer } from './useMenuSounds';

const VOLUME_KEY_STEP = 0.05;

/** One highlighted control, shared by pointer and keyboard; the seek bar is excluded. */
export function useMusicPanelNavigation({
  panel,
  root,
  open,
  music,
  onSound,
}: {
  panel: RefObject<HTMLElement | null>;
  root: RefObject<HTMLDivElement | null>;
  open: boolean;
  music: MenuMusic;
  onSound: MenuSoundPlayer;
}) {
  const current = useRef<HTMLElement | null>(null);
  const adjusting = useRef(false);
  const lastOrder = useRef('');
  const pointer = useRef({ x: -1, y: -1 });
  const control = (id: string) =>
    panel.current?.querySelector<HTMLElement>(`[data-music-control="${id}"]`) ?? null;
  const setAdjusting = (value: boolean) => {
    adjusting.current = value;
    control('volume')?.toggleAttribute('data-adjusting', value);
  };
  const release = () => {
    current.current?.removeAttribute('data-music-highlighted');
    current.current = null;
    setAdjusting(false);
    if (panel.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
  };
  const select = (node: HTMLElement | null, keyboard = false) => {
    if (!node) return;
    const changed = current.current !== node;
    current.current?.removeAttribute('data-music-highlighted');
    current.current = node;
    node.setAttribute('data-music-highlighted', '');
    if (node.dataset.musicControl?.startsWith('order-'))
      lastOrder.current = node.dataset.musicControl;
    if (changed && keyboard) onSound('settings');
  };
  const focus = (id: string) => {
    const node =
      id === 'headphone'
        ? (root.current?.querySelector<HTMLElement>('.headphone-button') ?? null)
        : control(id);
    if (!node) return;
    setAdjusting(id === 'volume');
    if (id === 'headphone') {
      current.current?.removeAttribute('data-music-highlighted');
      current.current = null;
      onSound('settings');
    } else select(node, true);
    node.focus({ preventScroll: true });
    if (id.startsWith('track-')) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  useEffect(() => {
    if (!open) {
      current.current?.removeAttribute('data-music-highlighted');
      current.current = null;
      setAdjusting(false);
    }
  }, [open]);

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const node = (event.target as HTMLElement).closest<HTMLElement>('[data-music-control]');
    if (!node) return;
    if (current.current !== node) setAdjusting(node.dataset.musicControl === 'volume');
    select(node);
  };
  const onPointer = (event: PointerEvent<HTMLElement>) => {
    if (
      event.type !== 'pointerdown' &&
      pointer.current.x === event.clientX &&
      pointer.current.y === event.clientY
    )
      return;
    pointer.current = { x: event.clientX, y: event.clientY };
    const node = (event.target as HTMLElement).closest<HTMLElement>('[data-music-control]');
    if (!node) return;
    setAdjusting(false);
    select(node);
    node.focus({ preventScroll: true });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    const target = event.target as HTMLElement;
    if (target.closest('.headphone-button')) {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      focus('play');
      return;
    }
    const id = target.closest<HTMLElement>('[data-music-control]')?.dataset.musicControl;
    if (!id || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter') {
      if (event.repeat) return;
      if (id === 'volume') {
        setAdjusting(!adjusting.current);
        onSound('settings');
      } else control(id)?.click();
      return;
    }
    if (id === 'volume' && adjusting.current && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const next = Math.max(
        0,
        Math.min(
          1,
          Math.round(
            (music.volume + (event.key === 'ArrowRight' ? VOLUME_KEY_STEP : -VOLUME_KEY_STEP)) *
              100,
          ) / 100,
        ),
      );
      if (next !== music.volume) {
        music.setVolume(next);
        onSound('settings');
      }
      return;
    }
    const selectedTrack =
      panel.current?.querySelector<HTMLElement>('.theme-track[aria-pressed="true"]')?.dataset
        .musicControl ?? (music.tracks.length ? 'track-0' : 'play');
    const selectedOrder =
      lastOrder.current ||
      panel.current?.querySelector<HTMLElement>('.music-order [aria-pressed="true"]')?.dataset
        .musicControl ||
      'order-0';
    let next = id;
    if (id === 'play') {
      if (event.key === 'ArrowRight')
        next = selectedTrack === 'play' ? selectedOrder : selectedTrack;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') next = 'headphone';
    } else if (id.startsWith('track-')) {
      const index = Number(id.slice(6));
      if (event.key === 'ArrowLeft') next = 'play';
      if (event.key === 'ArrowRight') next = selectedOrder;
      if (event.key === 'ArrowUp') next = index ? `track-${index - 1}` : 'headphone';
      if (event.key === 'ArrowDown')
        next = index + 1 < music.tracks.length ? `track-${index + 1}` : 'headphone';
    } else if (id.startsWith('order-')) {
      const index = Number(id.slice(6));
      if (event.key === 'ArrowLeft') next = index ? `order-${index - 1}` : selectedTrack;
      if (event.key === 'ArrowRight') next = `order-${Math.min(2, index + 1)}`;
      if (event.key === 'ArrowDown') next = 'volume';
      if (event.key === 'ArrowUp') next = 'headphone';
    } else if (id === 'mute') {
      if (event.key === 'ArrowRight') next = 'volume';
      if (event.key === 'ArrowLeft') next = selectedTrack;
      if (event.key === 'ArrowUp') next = selectedOrder;
      if (event.key === 'ArrowDown') next = 'headphone';
    } else if (id === 'volume') {
      if (event.key === 'ArrowLeft') next = 'mute';
      if (event.key === 'ArrowRight') {
        setAdjusting(true);
        return;
      }
      if (event.key === 'ArrowUp') next = selectedOrder;
      if (event.key === 'ArrowDown') next = 'headphone';
    }
    if (next !== id) focus(next);
  };
  return {
    onFocus,
    onPointer,
    onKeyDown,
    release,
    enter: () => focus(music.tracks.length ? 'track-0' : 'play'),
  };
}
