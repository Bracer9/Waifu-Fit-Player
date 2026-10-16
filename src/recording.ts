import { useEffect, useRef } from 'react';
import {
  LANES,
  uid,
  type Chart,
  type Direction,
  type Lane,
  type Note,
  type Snap,
  type StepDistance,
} from './model';
import { MediaController } from './media';
import { nextGrid, snapTime } from './timing';
export const isTextEntry = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest(
    'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="file"])',
  );
export const isTyping = (target: EventTarget | null) =>
  isTextEntry(target) || target instanceof HTMLSelectElement;
// Only gesture classification uses wall time; note timestamps always use the video clock.
const HOLD_THRESHOLD_MS = 250;
type Options = {
  enabled: boolean;
  lane: Lane;
  snap: Snap;
  chart: Chart;
  media: MediaController;
  onLane: (lane: Lane) => void;
  onNote: (note: Note) => void;
  notify: (message: string) => void;
};
export function useRecording(options: Options) {
  const opts = useRef(options);
  opts.current = options;
  const pending = useRef<{
    key: string;
    lane: Lane;
    direction: Direction;
    timeMs: number;
    pressedAt: number;
    modifier: 'none' | 'sway';
    distance?: StepDistance;
  } | null>(null);
  useEffect(() => {
    const cancel = () => {
      if (pending.current) {
        pending.current = null;
        opts.current.notify('已取消尚未完成的录入。');
      }
    };
    const keydown = (e: KeyboardEvent) => {
      const o = opts.current;
      if (!o.enabled || isTextEntry(e.target) || e.metaKey || e.altKey) return;
      // Armed recording owns transport / movement keys even when a closed select retains focus.
      if (e.code === 'Space' && e.target instanceof HTMLSelectElement) {
        e.preventDefault();
        e.stopPropagation();
        e.target.blur();
        if (!e.repeat) void o.media.toggle().catch(() => o.notify('请点击播放后继续录谱。'));
        return;
      }
      if (!e.ctrlKey && LANES.some((_, i) => e.key === String(i + 1))) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target instanceof HTMLSelectElement) e.target.blur();
        if (!e.repeat) {
          const lane = LANES[Number(e.key) - 1].id;
          opts.current = { ...o, lane };
          o.onLane(lane);
        }
        return;
      }
      let dir = (
        { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<
          string,
          Direction
        >
      )[e.key];
      if (o.lane === 'step' && dir === 'down') dir = 'free';
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.target instanceof HTMLSelectElement) e.target.blur();
      if (e.repeat || pending.current || !o.media.getStatus().playing) return;
      if (!(LANES.find((l) => l.id === o.lane)!.directions as readonly Direction[]).includes(dir)) {
        o.notify('当前轨道不支持这个方向。');
        return;
      }
      const timeMs = snapTime(
        o.media.element!.currentTime * 1000,
        o.chart.tempoSegments,
        o.snap,
        o.media.getStatus().durationMs,
      );
      pending.current = {
        key: e.key,
        lane: o.lane,
        direction: dir,
        timeMs,
        pressedAt: performance.now(),
        modifier: e.ctrlKey || dir === 'free' ? 'sway' : 'none',
        ...(o.lane === 'step' && dir !== 'free' && e.shiftKey ? { distance: 2 } : {}),
      };
    };
    const keyup = (e: KeyboardEvent) => {
      const p = pending.current,
        o = opts.current;
      if (!p || e.key !== p.key) return;
      e.preventDefault();
      pending.current = null;
      if (
        !o.enabled ||
        !o.media.getStatus().playing ||
        !o.media.element ||
        o.media.element.paused ||
        o.media.element.seeking ||
        o.media.element.ended
      )
        return;
      const short = performance.now() - p.pressedAt < HOLD_THRESHOLD_MS;
      if (short && p.direction !== 'free') {
        o.onNote({
          id: uid(),
          lane: p.lane,
          direction: p.direction,
          kind: 'tap',
          timeMs: p.timeMs,
          ...(p.distance ? { distance: p.distance } : {}),
        });
        return;
      }
      const duration = o.media.getStatus().durationMs;
      let endTimeMs = snapTime(
        o.media.element!.currentTime * 1000,
        o.chart.tempoSegments,
        o.snap,
        duration,
      );
      if (short && p.direction === 'free')
        endTimeMs = nextGrid(p.timeMs, o.chart.tempoSegments, 1, duration);
      if (endTimeMs <= p.timeMs)
        endTimeMs = nextGrid(p.timeMs, o.chart.tempoSegments, o.snap, duration);
      if (endTimeMs > p.timeMs)
        o.onNote({
          id: uid(),
          lane: p.lane,
          direction: p.direction,
          timeMs: p.timeMs,
          kind: 'hold',
          modifier: p.modifier,
          endTimeMs,
          ...(p.distance ? { distance: p.distance } : {}),
        });
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', cancel);
    const video = options.media.element;
    ['pause', 'seeking', 'ended', 'emptied'].forEach((name) =>
      video?.addEventListener(name, cancel),
    );
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', cancel);
      ['pause', 'seeking', 'ended', 'emptied'].forEach((name) =>
        video?.removeEventListener(name, cancel),
      );
      pending.current = null;
    };
  }, [options.media]);
  useEffect(() => {
    if (!options.enabled) pending.current = null;
  }, [options.enabled]);
}
