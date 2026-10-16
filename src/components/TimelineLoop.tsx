import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { LoopRange } from '../media';
import type { TempoSegment } from '../model';
import { formatTime, parseTimelinePosition } from '../timing';

export function LoopPositionField({
  label,
  timeMs,
  segments,
  onCommit,
  notify,
}: {
  label: string;
  timeMs: number;
  segments: TempoSegment[];
  onCommit: (timeMs: number) => boolean;
  notify: (text: string) => void;
}) {
  const formatted = formatTime(timeMs, true);
  const [draft, setDraft] = useState(formatted);
  useEffect(() => setDraft(formatted), [formatted]);
  return (
    <input
      className="loop-position-input"
      aria-label={label}
      title="输入 1.128（第 1 段第 128 小节）、1.128.3（第 3 拍）、03:12.500 或 192500ms；回车确认"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const parsed = parseTimelinePosition(e.currentTarget.value, segments);
        if (parsed === undefined) {
          notify(
            '位置格式：1.128（段.小节）、1.128.3（段.小节.拍）、03:12.500 或 192500ms。小节不能越过下一节拍段。',
          );
          setDraft(formatted);
        } else setDraft(onCommit(parsed) ? formatTime(parsed, true) : formatted);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.currentTarget.value = formatted;
          setDraft(formatted);
          e.currentTarget.blur();
        } else if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

type Edge = keyof LoopRange;
type Props = {
  range: LoopRange;
  enabled: boolean;
  px: number;
  labelWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  onChange: (edge: Edge, timeMs: number, unsnapped: boolean) => void;
  onDragging: (dragging: boolean) => void;
};

export function TimelineLoop(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const overlay = useRef<HTMLDivElement>(null);
  const dragging = useRef<{
    edge: Edge;
    clientX: number;
    offset: number;
    unsnapped: boolean;
    frame: number;
  } | null>(null);
  const stop = () => {
    if (dragging.current) cancelAnimationFrame(dragging.current.frame);
    dragging.current = null;
    latest.current.onDragging(false);
  };
  useEffect(() => () => stop(), []);
  const update = () => {
    const d = dragging.current;
    const surface = overlay.current;
    const { px, labelWidth, onChange } = latest.current;
    if (d && surface)
      onChange(
        d.edge,
        (d.clientX - surface.getBoundingClientRect().left - labelWidth) / px - d.offset,
        d.unsnapped,
      );
  };
  const autoScroll = () => {
    const d = dragging.current;
    const scroller = latest.current.scrollRef.current;
    if (!d || !scroller) return;
    const rect = scroller.getBoundingClientRect();
    const left = rect.left + latest.current.labelWidth + 24;
    const right = rect.right - 24;
    const delta = d.clientX < left ? -10 : d.clientX > right ? 10 : 0;
    if (delta) {
      scroller.scrollLeft += delta;
      update();
    }
    d.frame = requestAnimationFrame(autoScroll);
  };
  const start = (e: PointerEvent<HTMLButtonElement>, edge: Edge) => {
    if (e.button !== 0 || !overlay.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = {
      edge,
      clientX: e.clientX,
      offset:
        (e.clientX - overlay.current.getBoundingClientRect().left - props.labelWidth) / props.px -
        props.range[edge],
      unsnapped: e.altKey,
      frame: requestAnimationFrame(autoScroll),
    };
    props.onDragging(true);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    dragging.current.clientX = e.clientX;
    dragging.current.unsnapped = e.altKey;
    update();
  };
  return (
    <div
      ref={overlay}
      className={`timeline-loop ${props.enabled ? 'enabled' : ''}`}
      style={{
        clipPath: `inset(0 0 0 ${(props.scrollRef.current?.scrollLeft ?? 0) + props.labelWidth - 12}px)`,
      }}
    >
      <div
        className="loop-region"
        style={{
          left: props.labelWidth + props.range.startMs * props.px,
          width: (props.range.endMs - props.range.startMs) * props.px,
        }}
      />
      {(['startMs', 'endMs'] as const).map((edge) => (
        <div
          key={edge}
          className={`loop-boundary ${edge === 'startMs' ? 'start' : 'end'}`}
          style={{ left: props.labelWidth + props.range[edge] * props.px }}
        >
          <button
            type="button"
            className="loop-handle"
            aria-label={edge === 'startMs' ? '循环起点' : '循环终点'}
            title={`${edge === 'startMs' ? '上半：循环起点 A' : '下半：循环终点 B'} ${formatTime(props.range[edge], true)} · 拖动调整，Alt 暂时取消吸附`}
            onPointerDown={(e) => start(e, edge)}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              e.stopPropagation();
              props.onChange(
                edge,
                props.range[edge] + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1000 : 100),
                true,
              );
            }}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
