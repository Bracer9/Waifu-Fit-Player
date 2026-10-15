import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowLeftRight,
  Circle,
  Copy,
  Crosshair,
  Magnet,
  LockKeyhole,
  LockKeyholeOpen,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import {
  arrow,
  LANES,
  uid,
  type Chart,
  type Direction,
  type Lane,
  type Note,
  type Snap,
  type SpecialEvent,
} from '../model';
import { MediaController, useMediaStatus, useTime } from '../media';
import { formatTime, gridLines, nextGrid, segmentAt, snapTime } from '../timing';
import {
  deleteEvents,
  flipNotes,
  moveEvents,
  pasteEvents,
  resnapEvents,
  shiftNoteLanes,
} from '../editing';
import { isTyping, useRecording } from '../recording';
import { DirectionGlyph } from '../components/Glyph';

type Props = {
  chart: Chart;
  media: MediaController;
  onChange: (chart: Chart) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  notify: (text: string) => void;
};
type Drag = {
  mode: 'move' | 'start' | 'end' | 'draw' | 'marquee';
  x: number;
  y: number;
  time: number;
  ids: string[];
  original: Chart;
  lane: Lane | 'special';
  id?: string;
  moved: boolean;
  initialSelection: string[];
};
const LABEL = 124,
  RULER = 30,
  ROW = 54,
  SPECIAL = 36;

function NumberField({
  label,
  value,
  onCommit,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (draft.trim() && Number.isFinite(n) && n >= min && (max === undefined || n <= max))
            onCommit(n);
          else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (s: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) onCommit(draft.trim());
          else setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function Editor({
  chart,
  media,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  notify,
}: Props) {
  const time = useTime(media),
    status = useMediaStatus(media);
  const duration = status.durationMs || chart.videoHint.durationMs || 180000;
  const [lane, setLane] = useState<Lane>('squat');
  const [direction, setDirection] = useState<Direction>('down');
  const [hold, setHold] = useState(false),
    [sway, setSway] = useState(false);
  const [recording, setRecording] = useState(false),
    [snap, setSnap] = useState<Snap>(2);
  const [tool, setTool] = useState<'select' | 'draw'>('draw');
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100),
    [scroll, setScroll] = useState(0),
    [viewport, setViewport] = useState(900);
  const [follow, setFollow] = useState(true),
    [followLocked, setFollowLocked] = useState(true),
    [tab, setTab] = useState<'note' | 'tempo' | 'song'>('note');
  const [segmentId, setSegmentId] = useState(chart.tempoSegments[0].id);
  const [draft, setDraft] = useState<Chart | null>(null),
    [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    draftRef = useRef<Chart | null>(null);
  const clipboard = useRef<{ notes: Note[]; specials: SpecialEvent[] }>({
    notes: [],
    specials: [],
  });
  const px = zoom / 1000,
    width = Math.max(duration * px + LABEL + 60, viewport);
  const shown = draft || chart;
  const pickLane = (newLane: Lane) => {
    setLane(newLane);
    const dirs = LANES.find((l) => l.id === newLane)!.directions as readonly Direction[];
    setDirection((current) => (dirs.includes(current) ? current : dirs[0]));
  };
  useRecording({
    enabled: recording,
    lane,
    snap,
    chart,
    media,
    onLane: pickLane,
    onNote: (note) => onChange({ ...chart, notes: [...chart.notes, note] }),
    notify,
  });
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!follow || !status.playing || drag.current) return;
    const element = scrollRef.current;
    if (
      element &&
      (time * px < element.scrollLeft ||
        time * px > element.scrollLeft + element.clientWidth - LABEL - 70)
    )
      element.scrollLeft = Math.max(0, time * px - 120);
  }, [time, follow, status.playing, px]);
  const selectedNote = chart.notes.find((n) => selected.includes(n.id));
  const selectedSpecial = chart.specialEvents.find((n) => selected.includes(n.id));
  const event = selectedNote || selectedSpecial;
  const activeSegment =
    chart.tempoSegments.find((s) => s.id === segmentId) || chart.tempoSegments[0];
  const snapAt = (t: number) => snapTime(t, chart.tempoSegments, snap, duration);
  const copy = () => {
    clipboard.current = {
      notes: chart.notes.filter((n) => selected.includes(n.id)),
      specials: chart.specialEvents.filter((n) => selected.includes(n.id)),
    };
    notify(`已复制 ${clipboard.current.notes.length + clipboard.current.specials.length} 个事件。`);
  };
  const paste = () => {
    const result = pasteEvents(
      chart,
      clipboard.current.notes,
      clipboard.current.specials,
      snapAt(media.getTime()),
      duration,
    );
    onChange(result.chart);
    setSelected(result.ids);
  };
  const remove = () => {
    onChange(deleteEvents(chart, selected));
    setSelected([]);
  };
  const flip = () => onChange(flipNotes(chart, selected));
  const duplicate = () => {
    const notes = chart.notes.filter((n) => selected.includes(n.id)),
      specials = chart.specialEvents.filter((n) => selected.includes(n.id));
    const all = [...notes, ...specials];
    if (!all.length) return;
    const last = Math.max(
      ...all.map((n) => ('endTimeMs' in n ? (n.endTimeMs ?? n.timeMs) : n.timeMs)),
    );
    const result = pasteEvents(
      chart,
      notes,
      specials,
      nextGrid(last, chart.tempoSegments, snap, duration),
      duration,
    );
    onChange(result.chart);
    setSelected(result.ids);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const modifier = e.ctrlKey || e.metaKey;
      if (modifier && ['a', 'c', 'v', 'x', 'd'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        switch (e.key.toLowerCase()) {
          case 'a':
            setSelected([...chart.notes, ...chart.specialEvents].map((n) => n.id));
            break;
          case 'c':
            copy();
            break;
          case 'v':
            paste();
            break;
          case 'x':
            copy();
            remove();
            break;
          case 'd':
            duplicate();
            break;
        }
      } else if (!modifier && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!e.repeat) flip();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      } else if (e.key === 'Escape') {
        setSelected([]);
        setRecording(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const lines = useMemo(
    () =>
      gridLines(
        shown.tempoSegments,
        Math.max(0, (scroll - LABEL) / px),
        Math.min(duration, (scroll + viewport) / px),
        snap,
      ),
    [shown.tempoSegments, scroll, viewport, px, duration, snap],
  );
  const patchEvent = (changes: Record<string, unknown>) => {
    if (!event) return;
    if (selectedNote)
      onChange({
        ...chart,
        notes: chart.notes.map((n) => (n.id === event.id ? ({ ...n, ...changes } as Note) : n)),
      });
    else
      onChange({
        ...chart,
        specialEvents: chart.specialEvents.map((n) =>
          n.id === event.id ? { ...n, ...changes } : n,
        ),
      });
  };
  const changeKind = (isHold: boolean) => {
    if (!event) return;
    if (isHold) {
      const end = nextGrid(event.timeMs, chart.tempoSegments, 1, duration);
      if (end <= event.timeMs) {
        notify('视频末尾没有足够空间创建 HOLD。');
        return;
      }
      patchEvent(
        selectedNote ? { kind: 'hold', modifier: 'none', endTimeMs: end } : { endTimeMs: end },
      );
    } else if (selectedNote) {
      const note: Note = {
        id: selectedNote.id,
        lane: selectedNote.lane,
        direction: selectedNote.direction,
        timeMs: selectedNote.timeMs,
        kind: 'tap',
      };
      onChange({ ...chart, notes: chart.notes.map((n) => (n.id === note.id ? note : n)) });
    } else
      onChange({
        ...chart,
        specialEvents: chart.specialEvents.map((n) =>
          n.id === event.id ? { id: n.id, timeMs: n.timeMs } : n,
        ),
      });
  };
  const changeSegment = (changes: Partial<typeof activeSegment>) => {
    if (
      changes.anchorMs !== undefined &&
      chart.tempoSegments.some(
        (s) => s.id !== activeSegment.id && s.anchorMs === Math.round(changes.anchorMs!),
      )
    ) {
      notify('这个第一拍位置已有节拍段。');
      return;
    }
    onChange({
      ...chart,
      tempoSegments: chart.tempoSegments.map((s) =>
        s.id === activeSegment.id ? { ...s, ...changes } : s,
      ),
    });
  };
  const addSegment = () => {
    const anchorMs = Math.round(media.getTime());
    if (chart.tempoSegments.some((s) => s.anchorMs === anchorMs)) {
      notify('当前位置已有节拍段；请先移动播放位置。');
      return;
    }
    const id = uid();
    onChange({
      ...chart,
      tempoSegments: [
        ...chart.tempoSegments,
        { id, anchorMs, bpm: segmentAt(chart.tempoSegments, anchorMs)?.bpm ?? 120, meter: '4/4' },
      ],
    });
    setSegmentId(id);
  };
  const coordinates = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const pointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const { x, y } = coordinates(e);
    if (x < LABEL) return;
    const t = snapAt((x - LABEL) / px);
    if (y < RULER) {
      media.seek(t);
      return;
    }
    const row = Math.floor((y - RULER) / ROW);
    const targetLane = row >= 4 ? 'special' : LANES[row]?.id;
    if (!targetLane) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-event]');
    const id = target?.dataset.event;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!followLocked) setFollow(false);
    if (id) {
      const ids = e.shiftKey
        ? selected.includes(id)
          ? selected.filter((v) => v !== id)
          : [...selected, id]
        : selected.includes(id)
          ? selected
          : [id];
      setSelected(ids);
      setTab('note');
      const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset
        .handle;
      drag.current = {
        mode: handle === 'start' ? 'start' : handle === 'end' ? 'end' : 'move',
        x,
        y,
        time: t,
        ids,
        original: chart,
        lane: targetLane,
        id,
        moved: false,
        initialSelection: selected,
      };
    } else if (tool === 'select' || e.shiftKey) {
      drag.current = {
        mode: 'marquee',
        x,
        y,
        time: t,
        ids: [],
        original: chart,
        lane: targetLane,
        moved: false,
        initialSelection: e.shiftKey ? selected : [],
      };
      if (!e.shiftKey) setSelected([]);
    } else {
      if (targetLane === 'special' && !chart.specialMove) {
        notify('先在“曲目”面板启用本曲 SPECIAL。');
        setTab('song');
        return;
      }
      if (targetLane !== 'special') pickLane(targetLane);
      drag.current = {
        mode: 'draw',
        x,
        y,
        time: t,
        ids: [],
        original: chart,
        lane: targetLane,
        id: uid(),
        moved: false,
        initialSelection: [],
      };
    }
  };
  const updateDraft = (value: Chart) => {
    draftRef.current = value;
    setDraft(value);
  };
  const drawEvent = (d: Drag, end: number): Chart => {
    const isHold = hold || Math.abs(end - d.time) > 10;
    let start = Math.min(d.time, end),
      finish = Math.max(d.time, end);
    if (isHold && finish <= start) finish = nextGrid(start, chart.tempoSegments, snap, duration);
    start = Math.round(start);
    finish = Math.round(finish);
    if (isHold && finish <= start) return d.original;
    if (d.lane === 'special')
      return {
        ...d.original,
        specialEvents: [
          ...d.original.specialEvents,
          { id: d.id!, timeMs: start, ...(isHold ? { endTimeMs: finish } : {}) },
        ],
      };
    const dirs = LANES.find((l) => l.id === d.lane)!.directions as readonly Direction[];
    const dir = dirs.includes(direction) ? direction : dirs[0];
    const note: Note = isHold
      ? {
          id: d.id!,
          lane: d.lane,
          direction: dir,
          timeMs: start,
          kind: 'hold',
          modifier: sway ? 'sway' : 'none',
          endTimeMs: finish,
        }
      : { id: d.id!, lane: d.lane, direction: dir, timeMs: start, kind: 'tap' };
    return { ...d.original, notes: [...d.original.notes, note] };
  };
  const pointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = coordinates(e);
    if (Math.abs(x - d.x) + Math.abs(y - d.y) > 4) d.moved = true;
    if (!d.moved) return;
    const t = snapAt((x - LABEL) / px);
    if (d.mode === 'draw') updateDraft(drawEvent(d, t));
    else if (d.mode === 'move') {
      const first = [...d.original.notes, ...d.original.specialEvents].find((n) => n.id === d.id)!;
      const targetTime = snapAt(first.timeMs + (x - d.x) / px);
      let moved = moveEvents(d.original, d.ids, targetTime - first.timeMs, duration);
      const targetLane = LANES[Math.floor((y - RULER) / ROW)]?.id;
      if (d.lane !== 'special' && targetLane)
        moved = shiftNoteLanes(moved, d.ids, d.lane, targetLane);
      updateDraft(moved);
    } else if (d.mode === 'start' || d.mode === 'end') {
      const resize = <T extends Note | SpecialEvent>(n: T): T => {
        if (n.id !== d.id || !('endTimeMs' in n) || n.endTimeMs === undefined) return n;
        return d.mode === 'start'
          ? { ...n, timeMs: Math.min(t, n.endTimeMs - 1) }
          : { ...n, endTimeMs: Math.max(t, n.timeMs + 1) };
      };
      updateDraft({
        ...d.original,
        notes: d.original.notes.map(resize),
        specialEvents: d.original.specialEvents.map(resize),
      });
    } else {
      const box = {
        x: Math.min(x, d.x),
        y: Math.min(y, d.y),
        w: Math.abs(x - d.x),
        h: Math.abs(y - d.y),
      };
      setMarquee(box);
      const ids = [...chart.notes, ...chart.specialEvents]
        .filter((n) => {
          const index = 'lane' in n ? LANES.findIndex((l) => l.id === n.lane) : 4;
          const yy = RULER + index * ROW + (index === 4 ? SPECIAL : ROW) / 2;
          const xx = LABEL + n.timeMs * px,
            end =
              'endTimeMs' in n && n.endTimeMs !== undefined ? LABEL + n.endTimeMs * px : xx + 18;
          return yy >= box.y && yy <= box.y + box.h && end >= box.x && xx <= box.x + box.w;
        })
        .map((n) => n.id);
      setSelected([...new Set([...d.initialSelection, ...ids])]);
    }
  };
  const pointerUp = () => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'draw') {
      const result = draftRef.current || drawEvent(d, d.time);
      onChange(result);
      setSelected([d.id!]);
      setTab('note');
    } else if (draftRef.current) onChange(draftRef.current);
    drag.current = null;
    draftRef.current = null;
    setDraft(null);
    setMarquee(null);
  };
  const cancelDrag = () => {
    drag.current = null;
    draftRef.current = null;
    setDraft(null);
    setMarquee(null);
  };
  const renderEvent = (n: Note | SpecialEvent, index: number) => {
    const end = 'endTimeMs' in n ? n.endTimeMs : undefined;
    if (
      (end ?? n.timeMs) * px + LABEL < scroll - 40 ||
      n.timeMs * px + LABEL > scroll + viewport + 40
    )
      return null;
    const isSpecial = !('lane' in n),
      isSway = 'modifier' in n && n.modifier === 'sway';
    return (
      <div
        key={n.id}
        data-event={n.id}
        data-testid={isSpecial ? 'special-event' : 'editor-note'}
        className={`timeline-event ${end !== undefined ? 'long' : ''} ${isSway ? 'sway' : ''} ${isSpecial ? 'special' : ''} ${selected.includes(n.id) ? 'selected' : ''}`}
        title={`${isSpecial ? 'SPECIAL' : arrow[n.direction]} ${formatTime(n.timeMs, true)}${end ? ' — ' + formatTime(end, true) : ''}`}
        style={
          {
            left: LABEL + n.timeMs * px,
            top: RULER + index * ROW + (isSpecial ? 5 : 10),
            width: end !== undefined ? Math.max(24, (end - n.timeMs) * px) : 29,
            '--lane': isSpecial ? '#d3b5ff' : LANES[index].color,
          } as React.CSSProperties
        }
      >
        {end !== undefined && <span className="resize-handle start" data-handle="start" />}
        {isSpecial ? '★' : <DirectionGlyph direction={n.direction} size={18} />}
        {end !== undefined && (
          <span className="event-caption">{isSway ? 'SWAY' : isSpecial ? 'SPECIAL' : 'HOLD'}</span>
        )}
        {end !== undefined && <span className="resize-handle end" data-handle="end" />}
      </div>
    );
  };
  return (
    <section className="editor" aria-label="谱面编辑器">
      <div className="editor-toolbar">
        <div className="tool-group">
          <button
            className={`tool-button ${tool === 'select' ? 'active' : ''}`}
            title="选择 / 框选"
            aria-label="选择工具"
            onClick={() => setTool('select')}
          >
            <MousePointer2 size={17} />
          </button>
          <button
            className={`tool-button ${tool === 'draw' ? 'active' : ''}`}
            title="点击放置，拖动创建长条"
            aria-label="绘制工具"
            onClick={() => setTool('draw')}
          >
            <Pencil size={17} />
          </button>
        </div>
        <div className="tool-group">
          <button className="tool-button" aria-label="撤销" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={17} />
          </button>
          <button className="tool-button" aria-label="重做" disabled={!canRedo} onClick={onRedo}>
            <Redo2 size={17} />
          </button>
          <button
            className="tool-button"
            aria-label="复制"
            disabled={!selected.length}
            onClick={copy}
          >
            <Copy size={16} />
          </button>
          <button
            className="tool-button"
            aria-label="删除选中"
            disabled={!selected.length}
            onClick={remove}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <button
          className="tool-button flip-button"
          aria-label="反转方向"
          title="反转选中音符方向（F）"
          disabled={!selectedNote}
          onClick={flip}
        >
          <ArrowLeftRight size={16} />
          反向 <kbd>F</kbd>
        </button>
        <label className="inline-field">
          <Magnet size={15} />
          <select
            aria-label="吸附"
            value={snap}
            onChange={(e) => setSnap(Number(e.target.value) as Snap)}
          >
            <option value={0}>不吸附</option>
            <option value={1}>每拍</option>
            <option value={2}>1/2 拍</option>
            <option value={4}>1/4 拍</option>
          </select>
        </label>
        <label className="zoom-control">
          <ZoomIn size={16} />
          <input
            aria-label="时间轴缩放"
            type="range"
            min={30}
            max={240}
            step={10}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <div className="follow-control">
          <label className="check-label">
            <input
              type="checkbox"
              checked={follow}
              disabled={followLocked}
              onChange={(e) => setFollow(e.target.checked)}
            />
            跟随
          </label>
          <button
            className={`tool-button ${followLocked ? 'active' : ''}`}
            aria-label="锁定跟随"
            aria-pressed={followLocked}
            title={followLocked ? '跟随已锁定：暂停和编辑不会关闭跟随' : '锁定后始终保持跟随'}
            onClick={() => {
              if (!followLocked) setFollow(true);
              setFollowLocked(!followLocked);
            }}
          >
            {followLocked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}
          </button>
        </div>
        <button
          className="tool-button"
          aria-label="定位播放线"
          onClick={() => {
            if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, time * px - 150);
          }}
        >
          <Crosshair size={17} />
        </button>
        <span className="editor-position">{formatTime(time, true)}</span>
      </div>
      <div className="record-toolbar">
        <button
          className={`record-button ${recording ? 'armed' : ''}`}
          onClick={() => setRecording(!recording)}
          aria-pressed={recording}
        >
          <Circle size={12} fill="currentColor" />
          {recording ? '录谱已启用' : '启用按键录谱'}
        </button>
        <div className="lane-picks">
          {LANES.map((l, i) => (
            <button
              key={l.id}
              onClick={() => pickLane(l.id)}
              aria-pressed={lane === l.id}
              className={lane === l.id ? 'active' : ''}
              style={{ '--lane': l.color } as React.CSSProperties}
            >
              <kbd>{i + 1}</kbd>
              {l.name}
            </button>
          ))}
        </div>
        <div className="direction-picks" hidden={recording}>
          {LANES.find((l) => l.id === lane)!.directions.map((d) => (
            <button
              key={d}
              className={direction === d ? 'active' : ''}
              aria-label={`放置方向${arrow[d]}`}
              onClick={() => setDirection(d)}
            >
              {arrow[d]}
            </button>
          ))}
        </div>
        <select
          aria-label="绘制类型"
          hidden={recording}
          value={hold ? 'hold' : 'tap'}
          onChange={(e) => setHold(e.target.value === 'hold')}
        >
          <option value="tap">普通 TAP</option>
          <option value="hold">绘制 HOLD</option>
        </select>
        <label className="check-label" hidden={recording}>
          <input
            type="checkbox"
            checked={sway}
            disabled={!hold}
            onChange={(e) => setSway(e.target.checked)}
          />
          SWAY
        </label>
        <span className="record-hint">
          {recording
            ? '1–4 选轨 · 点按 TAP · 长按 HOLD · Ctrl + 长按 SWAY'
            : '点击放置 · 拖动拉长 · Shift 多选'}
        </span>
      </div>
      <div className="editor-body">
        <div className="timeline-panel">
          <div
            className="timeline-scroll"
            ref={scrollRef}
            onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
          >
            <div
              className={`timeline-surface tool-${tool}`}
              style={{ width, height: RULER + 4 * ROW + SPECIAL }}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={cancelDrag}
            >
              <div className="timeline-ruler" />
              {LANES.map((l, i) => (
                <div
                  className="timeline-row"
                  key={l.id}
                  style={{ top: RULER + i * ROW, height: ROW }}
                />
              ))}
              <div
                className="timeline-row special-row"
                style={{ top: RULER + 4 * ROW, height: SPECIAL }}
              />
              {lines.map((line) => (
                <div
                  key={line.timeMs}
                  className={`grid-line ${line.type}`}
                  style={{ left: LABEL + line.timeMs * px }}
                >
                  <span>{line.type === 'bar' ? line.label : ''}</span>
                </div>
              ))}
              {shown.tempoSegments.map((s, i) => (
                <div
                  key={s.id}
                  className="tempo-marker"
                  style={{ left: LABEL + s.anchorMs * px }}
                  title={`${s.bpm} BPM · ${s.meter}`}
                >
                  <span>
                    {i + 1} / {s.bpm}
                  </span>
                </div>
              ))}
              {shown.notes.map((n) =>
                renderEvent(
                  n,
                  LANES.findIndex((l) => l.id === n.lane),
                ),
              )}
              {shown.specialEvents.map((n) => renderEvent(n, 4))}
              <div className="playhead" style={{ left: LABEL + time * px }}>
                <span />
              </div>
              {marquee && (
                <div
                  className="marquee"
                  style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
                />
              )}
              <div className="sticky-labels" style={{ left: scroll }}>
                <div className="ruler-label">小节 / 拍</div>
                {LANES.map((l, i) => (
                  <button
                    key={l.id}
                    style={{ height: ROW, '--lane': l.color } as React.CSSProperties}
                    className={lane === l.id ? 'active' : ''}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => pickLane(l.id)}
                  >
                    <span>0{i + 1}</span>
                    {l.name}
                    <small>{l.directions.map((d) => arrow[d]).join(' ')}</small>
                  </button>
                ))}
                <button
                  className="special-label"
                  style={{ height: SPECIAL }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setTab('song')}
                >
                  ✦ SPECIAL
                </button>
              </div>
            </div>
          </div>
          <div className="timeline-footer">
            <span>
              {chart.notes.length} 音符 · {chart.specialEvents.length} SPECIAL · {selected.length}{' '}
              已选
            </span>
            <span>Ctrl+C / V 复制粘贴 · Delete 删除 · Ctrl+Z 撤销</span>
          </div>
        </div>
        <aside className="inspector">
          <div className="inspector-tabs">
            {(['note', 'tempo', 'song'] as const).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t === 'note' ? '选中事件' : t === 'tempo' ? '节拍段' : '曲目'}
              </button>
            ))}
          </div>
          <div className="inspector-content">
            {tab === 'note' ? (
              event ? (
                <>
                  <div className="inspector-title">
                    {selected.length > 1
                      ? `已选 ${selected.length} 个 · 属性修改首项`
                      : selectedNote
                        ? LANES.find((l) => l.id === selectedNote.lane)!.name
                        : 'SPECIAL'}
                  </div>
                  <NumberField
                    label="开始 / ms"
                    value={event.timeMs}
                    max={
                      'endTimeMs' in event && event.endTimeMs !== undefined
                        ? event.endTimeMs - 1
                        : duration
                    }
                    onCommit={(n) => patchEvent({ timeMs: Math.round(n) })}
                  />
                  <label className="field">
                    <span>类型</span>
                    <select
                      aria-label="选中事件类型"
                      value={'endTimeMs' in event && event.endTimeMs !== undefined ? 'hold' : 'tap'}
                      onChange={(e) => changeKind(e.target.value === 'hold')}
                    >
                      <option value="tap">{selectedNote ? '普通 TAP' : '瞬间 SPECIAL'}</option>
                      <option value="hold">{selectedNote ? '保持 HOLD' : '持续 SPECIAL'}</option>
                    </select>
                  </label>
                  {'endTimeMs' in event && event.endTimeMs !== undefined && (
                    <NumberField
                      label="结束 / ms"
                      value={event.endTimeMs}
                      min={event.timeMs + 1}
                      max={duration}
                      onCommit={(n) => patchEvent({ endTimeMs: Math.round(n) })}
                    />
                  )}
                  {selectedNote && (
                    <label className="field">
                      <span>动作方向</span>
                      <select
                        aria-label="选中音符方向"
                        value={selectedNote.direction}
                        onChange={(e) => patchEvent({ direction: e.target.value })}
                      >
                        {LANES.find((l) => l.id === selectedNote.lane)!.directions.map((d) => (
                          <option key={d} value={d}>
                            {arrow[d]} {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selectedNote?.kind === 'hold' && (
                    <label className="check-label inspector-check">
                      <input
                        type="checkbox"
                        checked={selectedNote.modifier === 'sway'}
                        onChange={(e) =>
                          patchEvent({ modifier: e.target.checked ? 'sway' : 'none' })
                        }
                      />
                      保持时自由摇摆 SWAY
                    </label>
                  )}
                  <div className="inspector-actions">
                    <button onClick={duplicate}>
                      <Copy size={13} />
                      复制到后面
                    </button>
                    <button onClick={() => onChange(resnapEvents(chart, selected, snap, duration))}>
                      <Magnet size={13} />
                      重新吸附
                    </button>
                  </div>
                </>
              ) : (
                <div className="inspector-empty">
                  <MousePointer2 size={26} />
                  <strong>选一个动作，微调一下。</strong>
                  <p>点选音符查看属性；拖动长条两端调整起止。选择工具支持框选。</p>
                </div>
              )
            ) : tab === 'tempo' ? (
              <>
                <label className="field">
                  <span>当前编辑段</span>
                  <select
                    aria-label="当前编辑段"
                    value={activeSegment.id}
                    onChange={(e) => setSegmentId(e.target.value)}
                  >
                    {chart.tempoSegments.map((s, i) => (
                      <option key={s.id} value={s.id}>
                        {i + 1} · {formatTime(s.anchorMs, true)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-pair">
                  <NumberField
                    label="BPM"
                    value={activeSegment.bpm}
                    min={0.01}
                    step={0.01}
                    onCommit={(n) => changeSegment({ bpm: n })}
                  />
                  <label className="field">
                    <span>拍号</span>
                    <select
                      aria-label="拍号"
                      value={activeSegment.meter}
                      onChange={(e) => changeSegment({ meter: e.target.value as '4/4' | '3/4' })}
                    >
                      <option>4/4</option>
                      <option>3/4</option>
                    </select>
                  </label>
                </div>
                <NumberField
                  label="本段 Offset / ms"
                  value={activeSegment.anchorMs}
                  max={duration}
                  onCommit={(n) => changeSegment({ anchorMs: Math.round(n) })}
                />
                <button
                  className="text-action"
                  onClick={() => changeSegment({ anchorMs: Math.round(media.getTime()) })}
                >
                  <Crosshair size={13} />
                  当前位置设为第一拍
                </button>
                <div className="inspector-actions">
                  <button onClick={addSegment}>
                    <Plus size={13} />
                    当前位置新增段
                  </button>
                  <button
                    disabled={chart.tempoSegments.length < 2}
                    onClick={() =>
                      onChange({
                        ...chart,
                        tempoSegments: chart.tempoSegments.filter((s) => s.id !== activeSegment.id),
                      })
                    }
                  >
                    <Trash2 size={13} />
                    删除段
                  </button>
                </div>
                <p className="inspector-tip">
                  BPM / Offset 只改变网格。已有动作保持原时间；需要调整时，可多选拖动或重新吸附。
                </p>
              </>
            ) : (
              <>
                <TextField
                  label="作品名称"
                  value={chart.title}
                  onCommit={(title) => onChange({ ...chart, title })}
                />
                <label className="check-label inspector-check">
                  <input
                    type="checkbox"
                    checked={!!chart.specialMove}
                    onChange={(e) => {
                      if (
                        !e.target.checked &&
                        chart.specialEvents.length &&
                        !window.confirm(
                          '关闭 SPECIAL 会删除本曲的全部 SPECIAL 事件，可撤销。继续？',
                        )
                      )
                        return;
                      onChange({
                        ...chart,
                        specialMove: e.target.checked
                          ? { name: '比心', icon: 'heart', previewBeats: 2 }
                          : null,
                        specialEvents: e.target.checked ? chart.specialEvents : [],
                      });
                    }}
                  />
                  启用本曲 SPECIAL
                </label>
                {chart.specialMove && (
                  <>
                    <TextField
                      label="招牌动作名称"
                      value={chart.specialMove.name}
                      onCommit={(name) =>
                        onChange({ ...chart, specialMove: { ...chart.specialMove!, name } })
                      }
                    />
                    <div className="field-pair">
                      <label className="field">
                        <span>图标</span>
                        <select
                          aria-label="SPECIAL 图标"
                          value={chart.specialMove.icon}
                          onChange={(e) =>
                            onChange({
                              ...chart,
                              specialMove: {
                                ...chart.specialMove!,
                                icon: e.target.value as 'heart' | 'star' | 'sparkles',
                              },
                            })
                          }
                        >
                          <option value="heart">♡ 比心</option>
                          <option value="star">☆ 星星</option>
                          <option value="sparkles">✦ 闪光</option>
                        </select>
                      </label>
                      <NumberField
                        label="预告 / 拍"
                        value={chart.specialMove.previewBeats}
                        min={0.5}
                        max={16}
                        step={0.5}
                        onCommit={(previewBeats) =>
                          onChange({
                            ...chart,
                            specialMove: { ...chart.specialMove!, previewBeats },
                          })
                        }
                      />
                    </div>
                  </>
                )}
                <p className="inspector-tip">
                  每首歌一种招牌动作。在下方 SPECIAL 标记行点击或拖长，可重复放置这个动作。
                </p>
                <span className="file-hint" title={chart.videoHint.fileName}>
                  {chart.videoHint.fileName || '尚未配对视频'}
                </span>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
