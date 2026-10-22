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
  type ArmAction,
  type ArmHand,
  type StepFoot,
} from './model';
import { MediaController } from './media';
import { chartTimeAt, nextGrid, snapTime } from './timing';
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
  hand: ArmHand;
  onHand: () => void;
  foot: StepFoot;
  connectPrevious?: boolean;
  onFoot: () => void;
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
    videoOffsetMs: number;
    modifier: 'none' | 'sway';
    distance?: StepDistance;
    follow?: true;
    connectPrevious?: boolean;
    armAction?: ArmAction;
    hand?: ArmHand;
    foot?: StepFoot;
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
      const follow = o.lane === 'step' && e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key);
      const armDiagonal = o.lane === 'punch' && ['ArrowLeft', 'ArrowRight'].includes(e.key);
      if (!o.enabled || isTextEntry(e.target) || e.metaKey || (e.altKey && !follow && !armDiagonal))
        return;
      // Armed recording owns transport / movement keys even when a closed select retains focus.
      if (e.code === 'Space' && e.target instanceof HTMLSelectElement) {
        e.preventDefault();
        e.stopPropagation();
        e.target.blur();
        if (!e.repeat) void o.media.toggle().catch(() => o.notify('请点击播放后继续录谱。'));
        return;
      }
      if (
        !e.ctrlKey &&
        !e.code.startsWith('Numpad') &&
        LANES.some((_, i) => e.key === String(i + 1))
      ) {
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
      if (
        (o.lane === 'punch' || o.lane === 'step' || o.lane === 'side_crunch') &&
        e.code === 'KeyH' &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target instanceof HTMLSelectElement) e.target.blur();
        if (!e.repeat) {
          if (o.lane === 'step' || o.lane === 'side_crunch') o.onFoot();
          else o.onHand();
        }
        return;
      }
      let dir = (
        { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<
          string,
          Direction
        >
      )[e.key];
      let armAction: ArmAction | undefined;
      let forwardHand: ArmHand | undefined;
      if (o.lane === 'punch') {
        const numpad = (
          {
            Numpad7: 'up_left',
            Numpad8: 'up',
            Numpad9: 'up_right',
            Numpad4: 'left',
            Numpad6: 'right',
            Numpad1: 'down_left',
            Numpad2: 'down',
            Numpad3: 'down_right',
          } as Record<string, Direction>
        )[e.code];
        if (numpad) dir = numpad;
        const palmHand = ({ KeyU: 'left', KeyI: 'right', KeyO: 'both' } as const)[
          e.code as 'KeyU' | 'KeyI' | 'KeyO'
        ];
        if (palmHand) {
          dir = 'forward';
          armAction = 'forward';
          forwardHand = palmHand;
        } else if (e.code === 'KeyJ' || e.code === 'KeyK') {
          dir = e.code === 'KeyJ' ? 'left' : 'right';
          armAction = 'punch';
        } else if (dir) {
          armAction = 'reach';
          if (armDiagonal && (e.shiftKey || e.altKey))
            dir = `${e.altKey ? 'down' : 'up'}_${dir}` as Direction;
        }
      }
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
      const chartTime = chartTimeAt(o.chart, o.media.element!.currentTime * 1000);
      if (chartTime < 0 || chartTime >= o.media.getStatus().durationMs) {
        o.notify('当前视频位置超出谱面可录入范围，请稍后录入或调整视频偏移。');
        return;
      }
      const timeMs = snapTime(
        chartTime,
        o.chart.tempoSegments,
        o.snap,
        o.media.getStatus().durationMs,
      );
      pending.current = {
        key: e.code || e.key,
        lane: o.lane,
        direction: dir,
        timeMs,
        pressedAt: performance.now(),
        videoOffsetMs: o.chart.videoOffsetMs ?? 0,
        modifier: e.ctrlKey || dir === 'free' ? 'sway' : 'none',
        ...(follow ? { follow: true } : {}),
        ...(follow && o.connectPrevious === false ? { connectPrevious: false } : {}),
        ...(o.lane === 'step' && dir !== 'free' && e.shiftKey && !follow ? { distance: 2 } : {}),
        ...(armAction ? { armAction } : {}),
        ...(armAction === 'reach' && o.hand !== 'any' ? { hand: o.hand } : {}),
        ...(forwardHand ? { hand: forwardHand } : {}),
        ...(o.lane === 'step' || o.lane === 'side_crunch'
          ? { foot: o.lane === 'side_crunch' && o.foot === 'both' ? 'left' : o.foot }
          : {}),
      };
    };
    const keyup = (e: KeyboardEvent) => {
      const p = pending.current,
        o = opts.current;
      if (!p || (e.code || e.key) !== p.key) return;
      e.preventDefault();
      pending.current = null;
      if (
        !o.enabled ||
        p.videoOffsetMs !== (o.chart.videoOffsetMs ?? 0) ||
        !o.media.getStatus().playing ||
        !o.media.element ||
        o.media.element.paused ||
        o.media.element.seeking ||
        o.media.element.ended
      )
        return;
      const short = performance.now() - p.pressedAt < HOLD_THRESHOLD_MS;
      if ((short || (p.follow && p.modifier !== 'sway')) && p.direction !== 'free') {
        o.onNote({
          id: uid(),
          lane: p.lane,
          direction: p.direction,
          kind: 'tap',
          timeMs: p.timeMs,
          ...(p.distance ? { distance: p.distance } : {}),
          ...(p.follow ? { follow: true } : {}),
          ...(p.connectPrevious === false ? { connectPrevious: false } : {}),
          ...(p.armAction ? { armAction: p.armAction } : {}),
          ...(p.hand ? { hand: p.hand } : {}),
          ...(p.foot ? { foot: p.foot } : {}),
        });
        return;
      }
      const duration = o.media.getStatus().durationMs;
      let endTimeMs = snapTime(
        chartTimeAt(o.chart, o.media.element!.currentTime * 1000),
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
          ...(p.follow ? { follow: true } : {}),
          ...(p.connectPrevious === false ? { connectPrevious: false } : {}),
          ...(p.distance ? { distance: p.distance } : {}),
          ...(p.armAction ? { armAction: p.armAction } : {}),
          ...(p.hand ? { hand: p.hand } : {}),
          ...(p.foot ? { foot: p.foot } : {}),
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
