import {
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { EXERCISE_INTENSITIES, INTENSITY_LABELS, type ExerciseIntensity } from '../chart-types';
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
  Repeat2,
  Trash2,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import {
  noteColor,
  chartCredit,
  noteSymbol,
  noteAction,
  isStepMove,
  isFollowStep,
  isLegHold,
  isLegRaise,
  isPunchAction,
  armHand,
  stepFoot,
  armActionValue,
  noteType,
  LANES,
  STEP_TYPES,
  uid,
  type Chart,
  type Direction,
  type Lane,
  type Note,
  type NoteType,
  type Snap,
  type SpecialEvent,
  type StepDistance,
  type ArmAction,
  type ArmHand,
  type StepFoot,
  type SpinDirection,
} from '../model';
import { MediaController, useMediaStatus, useTime, type LoopRange } from '../media';
import { LoopPositionField, TimelineLoop } from '../components/TimelineLoop';
import {
  chartTimeAt,
  videoTimeAt,
  formatTime,
  gridLines,
  nextGrid,
  segmentAt,
  snapTime,
} from '../timing';
import {
  deleteEvents,
  extendTap,
  flipNotes,
  moveEvents,
  pasteEvents,
  resnapEvents,
  shiftNoteLanes,
  setStepDistance,
  changeNoteForm,
  nextArmHand,
  setArmHand,
  nextStepFoot,
  setStepFoot,
} from '../editing';
import { isTyping, useRecording } from '../recording';
import { NoteGlyph, PalmPrint, ShoePrint, SquatDownCue, LegUpCue } from '../components/Glyph';
import { checkStepPositions } from '../stepping';
import { ArmActionPicker, ArmHandPicker } from '../components/ArmPicker';
import { armDisplayNotes, armEventIds, type DisplayNote } from '../armDisplay';
import { changeArmGesture } from '../editing';
import { BpmDetectButton } from '../components/BpmDetectButton';
import { firstBeatWindow } from '../first-beat';
import { PlayRangeFields } from '../components/PlayRangeFields';
import { chartPlayRange } from '../play-range';

import type { PatternRequest } from '../fitness/patterns';
const FitnessPatternPanel = lazy(() => import('../components/FitnessPatternPanel'));
const FITNESS_PATTERN_MIME = 'application/x-wfp-fitness-pattern';

export type EditorHandle = { locateEvent: (id: string) => void };

type Props = {
  chart: Chart;
  media: MediaController;
  videoSource: string;
  onChange: (chart: Chart) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  notify: (text: string) => void;
  publication?: ReactNode;
  ref?: Ref<EditorHandle>;
};
type Drag = {
  mode: 'move' | 'start' | 'end' | 'extend' | 'draw' | 'marquee';
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
  onClear,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value: number | undefined;
  onCommit: (n: number) => void;
  onClear?: () => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => setDraft(String(value ?? '')), [value]);
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
          if (!draft.trim() && onClear) onClear();
          else if (
            draft.trim() &&
            Number.isFinite(n) &&
            n >= min &&
            (max === undefined || n <= max)
          )
            onCommit(n);
          else setDraft(String(value ?? ''));
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
  allowEmpty = false,
  maxLength,
}: {
  label: string;
  value: string;
  onCommit: (s: string) => void;
  allowEmpty?: boolean;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() || allowEmpty) onCommit(draft.trim());
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
  videoSource,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  notify,
  publication,
  ref,
}: Props) {
  const time = chartTimeAt(chart, useTime(media)),
    status = useMediaStatus(media);
  const duration = status.durationMs || chart.videoHint.durationMs || 180000;
  const loopMin = Math.max(0, chart.videoOffsetMs ?? 0);
  const loopMax = duration + Math.min(0, chart.videoOffsetMs ?? 0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopSelection, setLoopSelection] = useState<LoopRange>(() => {
    const startMs = Math.max(loopMin, Math.min(loopMax - 100, time));
    return { startMs, endMs: Math.min(loopMax, startMs + 4000) };
  });
  const loopEnd = Math.max(loopMin, Math.min(loopMax, loopSelection.endMs));
  const loopStart = Math.max(loopMin, Math.min(loopEnd, loopSelection.startMs));
  const loopDragging = useRef(false);
  useEffect(() => {
    media.setLoopRange(
      loopEnabled
        ? {
            startMs: videoTimeAt(chart, loopStart),
            endMs: videoTimeAt(chart, loopEnd),
          }
        : null,
    );
  }, [media, loopEnabled, loopStart, loopEnd, chart.videoOffsetMs]);
  useEffect(() => () => media.setLoopRange(null), [media]);
  const cursorTime = () => Math.max(0, Math.min(duration, chartTimeAt(chart, media.getTime())));
  const setVideoOffset = (offset: number) => {
    const next: Chart = { ...chart, videoOffsetMs: Math.round(offset) };
    if (next.videoOffsetMs === 0) delete next.videoOffsetMs;
    onChange(next);
  };
  const [lane, setLane] = useState<Lane>('squat');
  const [direction, setDirection] = useState<Direction>('down');
  const [drawArmAction, setDrawArmAction] = useState<ArmAction>('reach');
  const [drawSpread, setDrawSpread] = useState(false);
  const [drawHand, setDrawHand] = useState<ArmHand>('any');
  const [drawFoot, setDrawFoot] = useState<StepFoot>('left');
  const [stepDistance, setDrawDistance] = useState<StepDistance>(1);
  const [drawType, setDrawType] = useState<NoteType>('tap');
  const [drawConnectPrevious, setDrawConnectPrevious] = useState(true);
  const [drawSpinDirection, setDrawSpinDirection] = useState<SpinDirection>('clockwise');
  const [recording, setRecording] = useState(false),
    [snap, setSnap] = useState<Snap>(2);
  const [tool, setTool] = useState<'select' | 'draw'>('draw');
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100),
    [scroll, setScroll] = useState(0),
    [viewport, setViewport] = useState(900);
  const [follow, setFollow] = useState(true),
    [followLocked, setFollowLocked] = useState(true),
    [tab, setTab] = useState<'note' | 'tempo' | 'song' | 'patterns'>('note');
  const [patternDrag, setPatternDrag] = useState<(PatternRequest & { beats: number }) | null>(null);
  const [patternDrop, setPatternDrop] = useState<number | null>(null);
  const insertingPattern = useRef(false);
  const latestChart = useRef(chart);
  latestChart.current = chart;
  useEffect(() => {
    if (chart.chartType !== 'fitness' && tab === 'patterns') setTab('note');
  }, [chart.chartType, tab]);
  const insertPattern = async (request: PatternRequest, target = cursorTime()) => {
    if (insertingPattern.current) return;
    insertingPattern.current = true;
    const original = chart;
    try {
      const { insertFitnessPattern } = await import('../fitness/patterns');
      if (latestChart.current !== original) return;
      const result = insertFitnessPattern(original, request, target);
      media.pause();
      onChange(result.chart);
      setSelected(result.ids);
      setTab('patterns');
      media.seek(videoTimeAt(result.chart, result.endMs));
      notify(`已插入 ${result.repeats} 组完整积木，可撤销。`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '积木插入失败。');
    } finally {
      insertingPattern.current = false;
      setPatternDrag(null);
      setPatternDrop(null);
    }
  };
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
    width = Math.max(
      Math.max(duration, chart.playRange ? chartPlayRange(chart).endMs : 0) * px + LABEL + 60,
      viewport,
    );
  const locateEvent = (id: string) => {
    const event =
      chart.notes.find((note) => note.id === id) ??
      chart.specialEvents.find((event) => event.id === id);
    if (!event) return;
    media.pause();
    media.seek(videoTimeAt(chart, event.timeMs));
    setSelected(armEventIds(chart.notes, id));
    setTab('note');
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, event.timeMs * px - 160);
  };
  useImperativeHandle(ref, () => ({ locateEvent }));
  const shown = draft || chart;
  const displayed = useMemo(() => armDisplayNotes(shown.notes, false), [shown.notes]);
  const spreadIds = useMemo(
    () =>
      new Set(
        armDisplayNotes(chart.notes, false)
          .filter((n) => n.pairedReach)
          .flatMap((n) => [n.id, n.pairedReach!]),
      ),
    [chart.notes],
  );
  const stepIssues = useMemo(() => checkStepPositions(shown), [shown]);
  const pickLane = (newLane: Lane) => {
    setLane(newLane);
    if (newLane === 'side_crunch') setDrawFoot((foot) => (foot === 'both' ? 'left' : foot));
    if (newLane !== 'step')
      setDrawType((current) =>
        current === 'follow' || current === 'leg-raise'
          ? 'tap'
          : current === 'follow-sway'
            ? 'sway'
            : current,
      );
    const dirs = LANES.find((l) => l.id === newLane)!.directions as readonly Direction[];
    setDirection((current) =>
      newLane === 'punch' && (drawArmAction === 'forward' || drawArmAction === 'clap')
        ? 'forward'
        : newLane === 'punch' && drawArmAction === 'punch'
          ? current === 'right'
            ? 'right'
            : 'left'
          : dirs.includes(current)
            ? current
            : dirs[0],
    );
  };
  useRecording({
    enabled: recording,
    lane,
    snap,
    chart,
    media,
    hand: drawHand,
    onHand: () => setDrawHand((hand) => nextArmHand(hand)),
    foot: drawFoot,
    connectPrevious: drawConnectPrevious,
    spinDirection: drawSpinDirection,
    onFoot: () => setDrawFoot((foot) => nextStepFoot(foot, lane === 'step')),
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
    if (!follow || !status.playing || drag.current || loopDragging.current) return;
    const element = scrollRef.current;
    if (
      element &&
      (time * px < element.scrollLeft ||
        time * px > element.scrollLeft + element.clientWidth - LABEL - 70)
    )
      element.scrollLeft = Math.max(0, time * px - 120);
  }, [time, follow, status.playing, px]);
  const selectedNote = chart.notes.find((n) => selected.includes(n.id));
  const selectedSpread = selectedNote && spreadIds.has(selectedNote.id);
  const selectedStep = chart.notes.find((n) => selected.includes(n.id) && isStepMove(n));
  const selectedFoot = chart.notes.find(
    (n) => selected.includes(n.id) && (n.lane === 'step' || n.lane === 'side_crunch'),
  );
  const selectedArm = chart.notes.find(
    (n) =>
      selected.includes(n.id) &&
      n.lane === 'punch' &&
      !spreadIds.has(n.id) &&
      n.armAction !== 'forward' &&
      n.armAction !== 'clap' &&
      !isPunchAction(n.lane, n.direction, n.armAction),
  );
  const canFlip = chart.notes.some(
    (n) =>
      selected.includes(n.id) &&
      (n.direction !== 'forward' || n.hand !== 'both') &&
      !spreadIds.has(n.id),
  );
  const selectedSpecial = chart.specialEvents.find((n) => selected.includes(n.id));
  const event = selectedNote || selectedSpecial;
  const activeSegment =
    chart.tempoSegments.find((s) => s.id === segmentId) || chart.tempoSegments[0];
  const firstBeatSearch = firstBeatWindow(chart, activeSegment, duration);
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
      snapAt(cursorTime()),
      duration,
    );
    onChange(result.chart);
    setSelected(result.ids);
  };
  const remove = () => {
    onChange(deleteEvents(chart, selected));
    setSelected([]);
  };
  const flip = () =>
    onChange(
      flipNotes(
        chart,
        selected.filter((id) => !spreadIds.has(id)),
      ),
    );
  const toggleDistance = () => onChange(setStepDistance(chart, selected));
  const toggleHand = () => {
    if (selectedSpread && !recording) return;
    if ((selectedArm || selectedFoot) && !recording)
      onChange(setStepFoot(setArmHand(chart, selected), selected));
    else if (lane === 'punch' && !drawSpread && (recording || drawArmAction === 'reach'))
      setDrawHand((hand) => nextArmHand(hand));
    else if (lane === 'step' || lane === 'side_crunch')
      setDrawFoot((foot) => nextStepFoot(foot, lane === 'step'));
  };
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
      if (isTyping(e.target) || e.isComposing || e.defaultPrevented) return;
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
      } else if (!modifier && !e.altKey && ['n', 'b'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (!e.repeat && !drag.current && status.ready) {
          media.pause();
          const last = [...chart.notes, ...chart.specialEvents].reduce(
            (end, event) =>
              Math.max(
                end,
                'endTimeMs' in event ? (event.endTimeMs ?? event.timeMs) : event.timeMs,
              ),
            0,
          );
          const target = e.key.toLowerCase() === 'n' ? videoTimeAt(chart, last) : 0;
          media.seek(target);
          if (scrollRef.current)
            scrollRef.current.scrollLeft = Math.max(
              0,
              chartTimeAt(chart, media.getTime()) * px - 160,
            );
        }
      } else if (!modifier && !e.altKey && ['s', 'e'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (!e.repeat && !drag.current) setTool(e.key.toLowerCase() === 's' ? 'select' : 'draw');
      } else if (!modifier && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!e.repeat) flip();
      } else if (!modifier && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (!e.repeat) toggleDistance();
      } else if (!modifier && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        if (!e.repeat) toggleHand();
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
    const ids = new Set(armEventIds(chart.notes, event.id));
    if (selectedNote)
      onChange({
        ...chart,
        notes: chart.notes.map((n) => (ids.has(n.id) ? ({ ...n, ...changes } as Note) : n)),
      });
    else
      onChange({
        ...chart,
        specialEvents: chart.specialEvents.map((n) =>
          n.id === event.id ? { ...n, ...changes } : n,
        ),
      });
  };
  const changeKind = (type: NoteType, direction = selectedNote?.direction) => {
    if (!event) return;
    const end =
      'endTimeMs' in event && event.endTimeMs !== undefined
        ? event.endTimeMs
        : nextGrid(event.timeMs, chart.tempoSegments, 1, duration);
    if ((type === 'hold' || type === 'sway' || type === 'follow-sway') && end <= event.timeMs) {
      notify('视频末尾没有足够空间创建长条。');
      return;
    }
    if (selectedNote && direction) {
      if (selectedSpread) {
        const ids = armEventIds(chart.notes, selectedNote.id);
        onChange({
          ...chart,
          notes: chart.notes.map((n) =>
            ids.includes(n.id) ? changeNoteForm(n, type, n.direction, end) : n,
          ),
        });
        return;
      }
      const note = changeNoteForm(selectedNote, type, direction, end);
      onChange({ ...chart, notes: chart.notes.map((n) => (n.id === note.id ? note : n)) });
    } else if (type === 'hold') patchEvent({ endTimeMs: end });
    else if (type === 'tap')
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
    const anchorMs = Math.round(cursorTime());
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
      media.seek(videoTimeAt(chart, t));
      return;
    }
    const row = Math.floor((y - RULER) / ROW);
    const targetLane = row >= LANES.length ? 'special' : LANES[row]?.id;
    if (!targetLane) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-event]');
    const id = target?.dataset.event;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!followLocked) setFollow(false);
    if (id) {
      const pair = armEventIds(chart.notes, id);
      const ids = e.shiftKey
        ? selected.includes(id)
          ? selected.filter((v) => !pair.includes(v))
          : [...new Set([...selected, ...pair])]
        : selected.includes(id)
          ? selected
          : pair;
      setSelected(ids);
      setTab('note');
      const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset
        .handle;
      drag.current = {
        mode: handle === 'start' || handle === 'end' || handle === 'extend' ? handle : 'move',
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
    const clap = d.lane === 'punch' && drawArmAction === 'clap';
    const isFollow = d.lane === 'step' && (drawType === 'follow' || drawType === 'follow-sway');
    const followTap = isFollow && drawType === 'follow';
    const raiseTap = d.lane === 'step' && drawType === 'leg-raise';
    const isHold =
      !followTap &&
      !raiseTap &&
      (drawType === 'hold' ||
        drawType === 'sway' ||
        drawType === 'follow-sway' ||
        Math.abs(end - d.time) > 10);
    let start = followTap || raiseTap ? d.time : Math.min(d.time, end),
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
    const dir = clap
      ? 'forward'
      : d.lane === 'punch' && drawArmAction === 'punch'
        ? direction === 'right'
          ? 'right'
          : 'left'
        : dirs.includes(direction)
          ? direction
          : dirs[0];
    const note: Note = isHold
      ? {
          id: d.id!,
          lane: d.lane,
          direction: dir,
          timeMs: start,
          kind: 'hold',
          modifier: drawType === 'sway' || drawType === 'follow-sway' ? 'sway' : 'none',
          endTimeMs: finish,
          ...(isFollow ? { follow: true } : {}),
        }
      : {
          id: d.id!,
          lane: d.lane,
          direction: dir,
          timeMs: start,
          kind: 'tap',
          ...(isFollow ? { follow: true } : {}),
        };
    if (raiseTap) note.stepAction = 'raise';
    if (d.lane === 'step' && dir !== 'free' && stepDistance === 2 && !isFollow && !raiseTap)
      note.distance = 2;
    if (isFollow && !drawConnectPrevious) note.connectPrevious = false;
    if (d.lane === 'step' && dir === 'free') note.spinDirection = drawSpinDirection;
    if (d.lane === 'step' || d.lane === 'side_crunch') note.foot = drawFoot;
    if (d.lane === 'punch') {
      note.armAction = drawArmAction;
      if (drawArmAction === 'clap') note.hand = 'both';
      else if ((drawArmAction === 'reach' && drawHand !== 'any') || drawArmAction === 'forward')
        note.hand = drawHand;
      if (drawSpread) {
        const left: Note = { ...note, direction: 'left', armAction: 'reach', hand: 'left' };
        const right: Note = { ...left, id: `${d.id}-right`, direction: 'right', hand: 'right' };
        return { ...d.original, notes: [...d.original.notes, left, right] };
      }
    }
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
    } else if (d.mode === 'extend') {
      updateDraft(
        x > d.x + 4
          ? armEventIds(d.original.notes, d.id!).reduce(
              (value, id) => extendTap(value, id, t, duration),
              d.original,
            )
          : d.original,
      );
    } else if (d.mode === 'start' || d.mode === 'end') {
      const resizeIds = new Set(armEventIds(d.original.notes, d.id!));
      const resize = <T extends Note | SpecialEvent>(n: T): T => {
        if (!resizeIds.has(n.id) || !('endTimeMs' in n) || n.endTimeMs === undefined) return n;
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
          const index = 'lane' in n ? LANES.findIndex((l) => l.id === n.lane) : LANES.length;
          const yy = RULER + index * ROW + (index === LANES.length ? SPECIAL : ROW) / 2;
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
      setSelected(armEventIds(result.notes, d.id!));
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
  const renderEvent = (n: DisplayNote | SpecialEvent, index: number) => {
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
        data-lane={isSpecial ? 'special' : n.lane}
        data-direction={isSpecial ? undefined : n.direction}
        data-action={isSpecial ? undefined : noteAction(n)}
        data-testid={isSpecial ? 'special-event' : 'editor-note'}
        className={`timeline-event ${end !== undefined ? 'long' : ''} ${isSway ? 'sway' : ''} ${isSpecial ? 'special' : ''} ${selected.includes(n.id) ? 'selected' : ''}`}
        data-step-issue={stepIssues.some((issue) => issue.noteId === n.id) || undefined}
        title={`${isSpecial ? 'SPECIAL' : isFollowStep(n) ? noteAction(n) : noteSymbol(n.lane, n.direction, n.distance, n.armAction)} ${formatTime(n.timeMs, true)}${end ? ' — ' + formatTime(end, true) : ''}${stepIssues.find((issue) => issue.noteId === n.id)?.message ? '\n' + stepIssues.find((issue) => issue.noteId === n.id)!.message : ''}`}
        style={
          {
            left: LABEL + n.timeMs * px,
            top: RULER + index * ROW + (isSpecial ? 5 : 10),
            width:
              end !== undefined
                ? Math.max(32, (end - n.timeMs) * px)
                : !isSpecial && n.lane === 'step'
                  ? 32
                  : 29,
            '--lane': isSpecial
              ? '#d3b5ff'
              : n.pairedReach
                ? 'var(--arms-both)'
                : noteColor(n.lane, n.direction, n.hand, n.armAction, n.foot),
          } as React.CSSProperties
        }
      >
        {end !== undefined && <span className="resize-handle start" data-handle="start" />}
        {isSpecial ? (
          '★'
        ) : (
          <span className="event-glyph">
            <NoteGlyph
              lane={n.lane}
              legHold={isLegHold(n)}
              legRaise={isLegRaise(n)}
              direction={n.direction}
              spinDirection={n.spinDirection}
              armAction={n.armAction}
              hand={n.hand}
              distance={n.distance}
              follow={isFollowStep(n)}
              size={18}
              pairedReach={!!n.pairedReach}
            />
          </span>
        )}
        {end !== undefined && (
          <span className="event-caption">
            {!isSpecial &&
              ((n.lane === 'squat' && !isSway) ||
                isLegHold(n) ||
                (isSway &&
                  (n.lane === 'step' || n.lane === 'punch') &&
                  (n.lane === 'punch' || n.direction === 'left' || n.direction === 'right'))) && (
                <svg className="slide-cue-icon" viewBox="0 0 40 40" aria-hidden="true">
                  {isLegHold(n) ? (
                    <LegUpCue />
                  ) : n.lane === 'squat' ? (
                    <SquatDownCue />
                  ) : n.lane === 'punch' ? (
                    <PalmPrint />
                  ) : (
                    <ShoePrint />
                  )}
                </svg>
              )}
            {!isSpecial && n.lane === 'step'
              ? noteAction(n)
              : isSway
                ? 'SWAY'
                : isSpecial
                  ? 'SPECIAL'
                  : 'HOLD'}
          </span>
        )}
        {end !== undefined && <span className="resize-handle end" data-handle="end" />}
        {!isSpecial &&
          n.kind === 'tap' &&
          !isFollowStep(n) &&
          (selected.length === 1 || (!isSpecial && !!n.pairedReach && selected.length === 2)) &&
          selected[0] === n.id &&
          n.timeMs < duration && (
            <span
              className="resize-handle tap-extend"
              data-handle="extend"
              data-testid="extend-note"
              title="向右拖动，延长为 HOLD"
            />
          )}
      </div>
    );
  };
  return (
    <section
      className="editor"
      aria-label="谱面编辑器"
      onChange={(e) => {
        if (recording && e.target instanceof HTMLSelectElement) e.target.blur();
      }}
    >
      <div className="editor-toolbar">
        <div className="tool-group">
          <button
            className={`tool-button ${tool === 'select' ? 'active' : ''}`}
            title="选择 / 框选（S）"
            aria-label="选择工具"
            aria-keyshortcuts="S"
            aria-pressed={tool === 'select'}
            onClick={() => setTool('select')}
          >
            <MousePointer2 size={17} />
            <kbd>S</kbd>
          </button>
          <button
            className={`tool-button ${tool === 'draw' ? 'active' : ''}`}
            title="编辑（E）：点击放置，拖动创建长条"
            aria-label="绘制工具"
            aria-keyshortcuts="E"
            aria-pressed={tool === 'draw'}
            onClick={() => setTool('draw')}
          >
            <Pencil size={17} />
            <kbd>E</kbd>
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
          title="反转选中音符方向／拳套或前伸手掌 L ↔ R（F），箭头的用手或用脚颜色不变"
          disabled={!canFlip}
          onClick={flip}
        >
          <ArrowLeftRight size={16} />
          反向 <kbd>F</kbd>
        </button>
        <button
          className="tool-button flip-button"
          aria-label="切换用手或用脚颜色"
          title="H：ARMS 循环用手；STEP 循环 L/R/BOTH 用脚颜色；SIDE CRUNCH 切换 L/R 腿色；拳套用 F 互换"
          disabled={
            !selectedArm &&
            !selectedFoot &&
            lane !== 'punch' &&
            lane !== 'step' &&
            lane !== 'side_crunch'
          }
          onClick={toggleHand}
        >
          换色 <kbd>H</kbd>
        </button>
        <button
          className="tool-button flip-button"
          aria-label="切换选中踏步跨度"
          title="切换选中 L/R 的 1/2 格跨度（D）"
          disabled={!selectedStep}
          onClick={toggleDistance}
        >
          跨度 <kbd>D</kbd>
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
      <div className="loop-toolbar">
        <button
          className={`tool-button loop-toggle ${loopEnabled ? 'active' : ''}`}
          aria-label="区间循环"
          aria-pressed={loopEnabled}
          disabled={loopEnd <= loopStart}
          title={loopEnd <= loopStart ? '拖开上沿的两个半漏斗，选择循环范围' : '开启或关闭区间循环'}
          onClick={() => setLoopEnabled(!loopEnabled)}
        >
          <Repeat2 size={16} /> 区间循环
        </button>
        <span className="loop-readout">
          {(['startMs', 'endMs'] as const).map((edge) => (
            <label key={edge}>
              {edge === 'startMs' ? 'A' : '— B'}
              <LoopPositionField
                label={edge === 'startMs' ? '循环起点位置' : '循环终点位置'}
                timeMs={edge === 'startMs' ? loopStart : loopEnd}
                segments={chart.tempoSegments}
                notify={notify}
                onCommit={(value) => {
                  if (value < loopMin || value > loopMax) {
                    notify(
                      `循环位置须在 ${formatTime(loopMin, true)} — ${formatTime(loopMax, true)} 之间。`,
                    );
                    return false;
                  }
                  const length = loopEnd - loopStart;
                  const next =
                    edge === 'startMs'
                      ? {
                          startMs: value,
                          endMs: value > loopEnd ? Math.min(loopMax, value + length) : loopEnd,
                        }
                      : {
                          startMs:
                            value < loopStart ? Math.max(loopMin, value - length) : loopStart,
                          endMs: value,
                        };
                  setLoopSelection(next);
                  if (next.endMs <= next.startMs) setLoopEnabled(false);
                  const scroller = scrollRef.current;
                  if (
                    scroller &&
                    (value * px < scroller.scrollLeft ||
                      value * px > scroller.scrollLeft + scroller.clientWidth - LABEL - 24)
                  )
                    scroller.scrollLeft = Math.max(0, value * px - 100);
                  return true;
                }}
              />
            </label>
          ))}
        </span>
        <span className="loop-help">
          上半 A / 下半 B · 可填 1.128（段.小节）或 03:12.500 · Alt 拖动不吸附
        </span>
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
              data-lane={l.id}
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
        <div className="direction-picks" hidden={recording || lane === 'punch'}>
          {LANES.find((l) => l.id === lane)!
            .directions.filter((d) => d !== 'free')
            .map((d) => (
              <button
                key={d}
                className={direction === d ? 'active' : ''}
                aria-label={`放置方向${noteSymbol(lane, d)}`}
                aria-pressed={direction === d}
                data-lane={lane}
                data-direction={d}
                style={
                  {
                    '--lane': noteColor(lane, d, undefined, undefined, drawFoot),
                  } as React.CSSProperties
                }
                onClick={() => setDirection(d)}
              >
                <NoteGlyph lane={lane} direction={d} size={20} />
              </button>
            ))}
        </div>
        {lane === 'punch' && (
          <>
            {!recording && (
              <ArmActionPicker
                label="绘制手臂动作"
                value={
                  drawSpread
                    ? 'spread'
                    : armActionValue({ lane, direction, armAction: drawArmAction, hand: drawHand })
                }
                hand={drawHand}
                onChange={(value) => {
                  setDrawSpread(value === 'spread');
                  if (value === 'clap') {
                    setDrawArmAction('clap');
                    setDrawHand('both');
                    setDirection('forward');
                    return;
                  }
                  if (value === 'spread') {
                    setDrawArmAction('reach');
                    setDrawHand('both');
                    setDirection('left');
                    return;
                  }
                  if (value.startsWith('forward-')) {
                    setDrawArmAction('forward');
                    setDirection('forward');
                    setDrawHand(value.slice(8) as ArmHand);
                    return;
                  }
                  setDrawArmAction(value.startsWith('punch-') ? 'punch' : 'reach');
                  setDirection((value.startsWith('punch-') ? value.slice(6) : value) as Direction);
                }}
              />
            )}
            {(recording || drawArmAction === 'reach') && (
              <ArmHandPicker
                label="录入用手"
                value={drawHand}
                onChange={setDrawHand}
                disabled={drawSpread && !recording}
              />
            )}
          </>
        )}
        {(lane === 'step' || lane === 'side_crunch') && (
          <ArmHandPicker
            feet
            bothFeet={lane === 'step'}
            label={lane === 'side_crunch' ? '录入用腿' : '录入用脚'}
            value={drawFoot}
            onChange={(foot) => setDrawFoot(foot as StepFoot)}
          />
        )}
        {lane === 'step' &&
          direction !== 'free' &&
          drawType !== 'follow' &&
          drawType !== 'follow-sway' &&
          drawType !== 'leg-raise' &&
          !recording && (
            <label className="inline-field step-distance-picker">
              跨度
              <select
                aria-label="绘制踏步跨度"
                value={stepDistance}
                onChange={(e) => setDrawDistance(Number(e.target.value) as StepDistance)}
              >
                <option value={1}>1 格</option>
                <option value={2}>2 格</option>
              </select>
            </label>
          )}
        <select
          aria-label="绘制类型"
          hidden={recording}
          value={lane === 'step' && direction === 'free' ? 'free-sway' : drawType}
          onChange={(e) => {
            if (lane === 'step') {
              const free = e.target.value === 'free-sway';
              setDirection(free ? 'free' : direction === 'free' ? 'left' : direction);
              setDrawType(free ? 'sway' : (e.target.value as NoteType));
            } else setDrawType(e.target.value as NoteType);
          }}
        >
          {lane === 'step' ? (
            STEP_TYPES.map((variant) => (
              <option key={variant.value} value={variant.value}>
                {variant.label}
              </option>
            ))
          ) : (
            <>
              <option value="tap">TAP</option>
              <option value="hold">HOLD</option>
              <option value="sway">SWAY</option>
            </>
          )}
        </select>
        {lane === 'step' && (recording || direction === 'free') && (
          <label className="inline-field">
            SPIN 方向
            <select
              aria-label="绘制 SPIN 旋转方向"
              value={drawSpinDirection}
              onChange={(e) => setDrawSpinDirection(e.target.value as SpinDirection)}
            >
              <option value="clockwise">↻ 顺时针</option>
              <option value="counterclockwise">↺ 逆时针</option>
            </select>
          </label>
        )}
        {lane === 'step' && (recording || drawType === 'follow' || drawType === 'follow-sway') && (
          <label className="inline-field">
            <input
              type="checkbox"
              aria-label="新建 FOLLOW 连接前一个音符"
              checked={drawConnectPrevious}
              onChange={(e) => setDrawConnectPrevious(e.target.checked)}
            />
            虚线连接前一个音符
          </label>
        )}
        <span className="record-hint">
          {recording
            ? lane === 'step'
              ? '←/→ 方向 · ↑ LEG RAISE · H 换脚颜色 · Alt + ←/→ FOLLOW · Ctrl + Alt + 长按 FOLLOW SWAY · ↓ SPIN 原地转圈 · Shift 跨两格 · 长按 LEG HOLD 抬腿 · Ctrl + 长按 SWAY'
              : lane === 'punch'
                ? '↑↓←→ · Shift+←/→ ↖↗ · Alt+←/→ ↙↘ · J/K 拳套 · U/I/O 左/右/双手前伸 · P 拍手 · H 箭头换手 · 长按 HOLD · Ctrl+长按 SWAY'
                : lane === 'side_crunch'
                  ? '←/→ 动作方向 · H 换腿颜色 · 长按 HOLD · Ctrl + 长按 SWAY'
                  : '1–5 选轨 · 点按 TAP · 长按 HOLD · Ctrl + 长按 SWAY'
            : lane === 'step' && drawType === 'leg-raise'
              ? 'LEG RAISE：单次抬腿 · H 换脚颜色 · 仅 TAP'
              : lane === 'step' && (drawType === 'follow' || drawType === 'follow-sway')
                ? drawType === 'follow-sway'
                  ? 'FOLLOW SWAY：跟脚并拢后持续摇摆 · H 换脚颜色 · 拖动设置时长'
                  : 'FOLLOW：指定脚同方向跟上并拢 · H 换脚颜色 · 仅 TAP'
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
              style={{ width, height: RULER + LANES.length * ROW + SPECIAL }}
              onDragOver={(e) => {
                if (
                  chart.chartType !== 'fitness' ||
                  !patternDrag ||
                  !e.dataTransfer.types.includes(FITNESS_PATTERN_MIME)
                )
                  return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                const raw = Math.max(
                  0,
                  (e.clientX - e.currentTarget.getBoundingClientRect().left - LABEL) / px,
                );
                const segment = segmentAt(chart.tempoSegments, raw) ?? chart.tempoSegments[0];
                const barMs = (60000 / segment.bpm) * (segment.meter === '3/4' ? 3 : 4);
                setPatternDrop(
                  Math.max(
                    segment.anchorMs,
                    Math.round(
                      segment.anchorMs + Math.round((raw - segment.anchorMs) / barMs) * barMs,
                    ),
                  ),
                );
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setPatternDrop(null);
              }}
              onDrop={(e) => {
                if (
                  chart.chartType !== 'fitness' ||
                  !e.dataTransfer.types.includes(FITNESS_PATTERN_MIME)
                )
                  return;
                e.preventDefault();
                const target = Math.max(
                  0,
                  (e.clientX - e.currentTarget.getBoundingClientRect().left - LABEL) / px,
                );
                try {
                  const request = JSON.parse(
                    e.dataTransfer.getData(FITNESS_PATTERN_MIME),
                  ) as PatternRequest;
                  void insertPattern(request, target);
                } catch {
                  notify('无法读取积木，请重新拖动。');
                  setPatternDrag(null);
                  setPatternDrop(null);
                }
              }}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={cancelDrag}
            >
              <div className="timeline-ruler" />
              {patternDrop !== null && patternDrag && (
                <div
                  className="fitness-drop-preview"
                  style={{
                    left: LABEL + patternDrop * px,
                    width:
                      ((patternDrag.beats * 60000) /
                        (segmentAt(chart.tempoSegments, patternDrop) ?? chart.tempoSegments[0])
                          .bpm) *
                      px,
                  }}
                >
                  <span>积木 · {formatTime(patternDrop)}</span>
                </div>
              )}

              {LANES.map((l, i) => (
                <div
                  className="timeline-row"
                  key={l.id}
                  style={{ top: RULER + i * ROW, height: ROW }}
                />
              ))}
              <div
                className="timeline-row special-row"
                style={{ top: RULER + LANES.length * ROW, height: SPECIAL }}
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
              {chart.playRange && (
                <div
                  className="play-range-end"
                  role="img"
                  aria-label={`游玩终点 ${formatTime(chart.playRange.endMs, true)}`}
                  style={{ left: LABEL + chartPlayRange(chart).endMs * px }}
                >
                  <span>终点 {formatTime(chart.playRange.endMs)}</span>
                </div>
              )}
              {displayed.map((n) =>
                renderEvent(
                  n,
                  LANES.findIndex((l) => l.id === n.lane),
                ),
              )}
              {shown.specialEvents.map((n) => renderEvent(n, LANES.length))}
              <div className="playhead" style={{ left: LABEL + time * px }}>
                <span />
              </div>
              <TimelineLoop
                range={{ startMs: loopStart, endMs: loopEnd }}
                enabled={loopEnabled}
                px={px}
                labelWidth={LABEL}
                scrollRef={scrollRef}
                onDragging={(value) => {
                  loopDragging.current = value;
                }}
                onChange={(edge, value, unsnapped) => {
                  const t = unsnapped ? Math.round(value) : snapAt(value);
                  const nextRange =
                    edge === 'startMs'
                      ? { startMs: Math.max(loopMin, Math.min(loopEnd, t)), endMs: loopEnd }
                      : {
                          startMs: loopStart,
                          endMs: Math.min(loopMax, Math.max(loopStart, t)),
                        };
                  setLoopSelection(nextRange);
                  if (nextRange.endMs <= nextRange.startMs) setLoopEnabled(false);
                }}
              />
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
                    data-lane={l.id}
                    style={{ height: ROW, '--lane': l.color } as React.CSSProperties}
                    className={lane === l.id ? 'active' : ''}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => pickLane(l.id)}
                  >
                    <span>0{i + 1}</span>
                    {l.name}
                    <small>
                      {l.id === 'punch'
                        ? '↗ · L/R'
                        : l.directions.map((d) => noteSymbol(l.id, d)).join(' ')}
                    </small>
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
            {(
              [
                'note',
                'tempo',
                'song',
                ...(chart.chartType === 'fitness' ? ['patterns' as const] : []),
              ] as const
            ).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t === 'note'
                  ? '选中事件'
                  : t === 'tempo'
                    ? '节拍段'
                    : t === 'patterns'
                      ? '积木'
                      : '曲目'}
              </button>
            ))}
          </div>
          <div className="inspector-content">
            {tab === 'patterns' && chart.chartType === 'fitness' ? (
              <Suspense fallback={<p className="inspector-tip">加载积木…</p>}>
                <FitnessPatternPanel
                  onInsert={(request) => void insertPattern(request)}
                  onDrag={(value) => {
                    setPatternDrag(value);
                    setPatternDrop(null);
                  }}
                />
              </Suspense>
            ) : tab === 'note' ? (
              event ? (
                <>
                  <div className="inspector-title">
                    {selectedSpread && selected.length === 2
                      ? '双臂向两侧展开'
                      : selected.length > 1
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
                      value={
                        selectedNote?.lane === 'step'
                          ? selectedNote.direction === 'free'
                            ? 'free-sway'
                            : noteType(selectedNote)
                          : selectedNote?.kind === 'hold' && selectedNote.modifier === 'sway'
                            ? 'sway'
                            : 'endTimeMs' in event && event.endTimeMs !== undefined
                              ? 'hold'
                              : 'tap'
                      }
                      onChange={(e) => {
                        if (selectedNote?.lane === 'step') {
                          const free = e.target.value === 'free-sway';
                          changeKind(
                            free ? 'sway' : (e.target.value as NoteType),
                            free
                              ? 'free'
                              : selectedNote.direction === 'free'
                                ? 'left'
                                : selectedNote.direction,
                          );
                        } else changeKind(e.target.value as NoteType);
                      }}
                    >
                      {selectedNote?.lane === 'step' ? (
                        STEP_TYPES.map((variant) => (
                          <option key={variant.value} value={variant.value}>
                            {variant.label}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="tap">{selectedNote ? 'TAP' : 'SPECIAL'}</option>
                          <option value="hold">{selectedNote ? 'HOLD' : 'SPECIAL HOLD'}</option>
                          {selectedNote && <option value="sway">SWAY</option>}
                        </>
                      )}
                    </select>
                  </label>
                  {selectedNote?.lane === 'step' && selectedNote.direction === 'free' && (
                    <label className="field">
                      <span>SPIN 旋转方向</span>
                      <select
                        aria-label="选中 SPIN 旋转方向"
                        value={selectedNote.spinDirection ?? 'clockwise'}
                        onChange={(e) =>
                          patchEvent({ spinDirection: e.target.value as SpinDirection })
                        }
                      >
                        <option value="clockwise">↻ 顺时针</option>
                        <option value="counterclockwise">↺ 逆时针</option>
                      </select>
                    </label>
                  )}
                  {selectedNote && isFollowStep(selectedNote) && (
                    <label className="inline-field">
                      <input
                        type="checkbox"
                        aria-label="选中 FOLLOW 连接前一个音符"
                        checked={selectedNote.connectPrevious !== false}
                        onChange={(e) =>
                          patchEvent({ connectPrevious: e.target.checked ? undefined : false })
                        }
                      />
                      虚线连接前一个音符
                    </label>
                  )}
                  {'endTimeMs' in event && event.endTimeMs !== undefined && (
                    <NumberField
                      label="结束 / ms"
                      value={event.endTimeMs}
                      min={event.timeMs + 1}
                      max={duration}
                      onCommit={(n) => patchEvent({ endTimeMs: Math.round(n) })}
                    />
                  )}
                  {(selectedNote?.lane === 'step' || selectedNote?.lane === 'side_crunch') && (
                    <div className="arm-inspector">
                      <span>{selectedNote.lane === 'side_crunch' ? '动作方向' : '移动方向'}</span>
                      <div className="direction-picks">
                        {(['left', 'right'] as const).map((direction) => (
                          <button
                            key={direction}
                            aria-label={`选中${selectedNote.lane === 'side_crunch' ? '侧收腹' : '踏步'}方向 ${direction === 'left' ? '←' : '→'}`}
                            aria-pressed={selectedNote.direction === direction}
                            className={selectedNote.direction === direction ? 'active' : ''}
                            style={
                              {
                                '--lane': noteColor(
                                  selectedNote.lane,
                                  direction,
                                  undefined,
                                  undefined,
                                  stepFoot(selectedNote),
                                ),
                              } as React.CSSProperties
                            }
                            onClick={() => changeKind(noteType(selectedNote), direction)}
                          >
                            <NoteGlyph lane={selectedNote.lane} direction={direction} size={20} />
                          </button>
                        ))}
                      </div>
                      <span>
                        {selectedNote.lane === 'side_crunch' ? '用腿' : '用脚'}颜色 · H
                        {selected.length > 1 ? ' · 批量' : ''}
                      </span>
                      <ArmHandPicker
                        feet
                        bothFeet={selectedNote.lane === 'step'}
                        label={
                          selectedNote.lane === 'side_crunch' ? '选中侧收腹用腿' : '选中踏步用脚'
                        }
                        value={stepFoot(selectedNote)}
                        onChange={(foot) =>
                          onChange(setStepFoot(chart, selected, foot as StepFoot))
                        }
                      />
                      <p className="inspector-tip">
                        {selectedNote.lane === 'side_crunch'
                          ? 'L 左腿蓝色，R 右腿红色；箭头独立表示动作方向。'
                          : 'L 左脚蓝色，R 右脚红色，BOTH 双脚紫色；箭头表示移动方向。'}
                      </p>
                    </div>
                  )}
                  {selectedNote?.lane === 'punch' && (
                    <div className="arm-inspector">
                      <span>手臂动作</span>
                      <ArmActionPicker
                        label="选中手臂动作"
                        value={selectedSpread ? 'spread' : armActionValue(selectedNote)}
                        hand={selectedSpread ? 'both' : armHand(selectedNote)}
                        onChange={(value) => {
                          const next = changeArmGesture(chart, selectedNote.id, value);
                          onChange(next.chart);
                          setSelected(next.ids);
                        }}
                      />
                      {selectedNote.armAction === 'clap' ? (
                        <p className="inspector-tip">
                          CLAP 拍手：双手紫色，支持 TAP／HOLD／SWAY。录谱点按 P、长按 P 保持、Ctrl +
                          长按 P 为 SWAY。
                        </p>
                      ) : selectedNote.armAction === 'forward' ? (
                        <p className="inspector-tip">
                          水平前伸：L 左手蓝色，R 右手红色，BOTH
                          双手紫色；左掌拇指朝右，右掌拇指朝左。F 互换单手。
                        </p>
                      ) : !isPunchAction(
                          selectedNote.lane,
                          selectedNote.direction,
                          selectedNote.armAction,
                        ) ? (
                        <>
                          <span>用手颜色 · H{selected.length > 1 ? ' · 批量' : ''}</span>
                          <ArmHandPicker
                            label="选中手臂用手"
                            value={selectedSpread ? 'both' : armHand(selectedNote)}
                            disabled={!!selectedSpread}
                            onChange={(hand) => onChange(setArmHand(chart, selected, hand))}
                          />
                        </>
                      ) : (
                        <p className="inspector-tip">正面出拳：L 左手蓝色，R 右手红色。F 互换。</p>
                      )}
                    </div>
                  )}
                  {selectedNote &&
                    selectedNote.lane !== 'step' &&
                    selectedNote.lane !== 'side_crunch' &&
                    selectedNote.lane !== 'punch' && (
                      <label className="field">
                        <span>动作方向</span>
                        <select
                          aria-label="选中音符方向"
                          value={selectedNote.direction}
                          onChange={(e) =>
                            onChange({
                              ...chart,
                              notes: chart.notes.map((n) =>
                                n.id === selectedNote.id
                                  ? { ...n, direction: e.target.value as Direction }
                                  : n,
                              ),
                            })
                          }
                        >
                          {LANES.find((l) => l.id === selectedNote.lane)!.directions.map((d) => (
                            <option key={d} value={d}>
                              {noteSymbol(selectedNote.lane, d)}{' '}
                              {d === 'left'
                                ? 'LEFT'
                                : d === 'right'
                                  ? 'RIGHT'
                                  : d === 'up'
                                    ? 'UP'
                                    : 'DOWN'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  {selectedStep && (
                    <label className="field">
                      <span>踏步跨度{selected.length > 1 ? ' · 批量' : ''}</span>
                      <select
                        aria-label="选中踏步跨度"
                        value={selectedStep.distance ?? 1}
                        onChange={(e) =>
                          onChange(
                            setStepDistance(
                              chart,
                              selected,
                              Number(e.target.value) as StepDistance,
                            ),
                          )
                        }
                      >
                        <option value={1}>1 格</option>
                        <option value={2}>2 格</option>
                      </select>
                    </label>
                  )}
                  {selectedNote?.lane === 'step' && (
                    <p className="inspector-tip">
                      {isFollowStep(selectedNote)
                        ? selectedNote.kind === 'hold'
                          ? 'FOLLOW SWAY：朝箭头方向跟脚并拢后持续摇摆；可拖动调整时长。'
                          : 'FOLLOW：另一只脚朝箭头方向跟上并拢；可放在任意拍点，仅 TAP。'
                        : selectedNote.direction === 'free'
                          ? '原地自由摇摆；可在类型菜单直接切换为左右 TAP、HOLD 或 SWAY。'
                          : 'TAP 迈步；FOLLOW 跟脚并拢；FOLLOW SWAY 并拢后摇摆；HOLD 单脚支撑；SWAY 迈出后摇摆。类型菜单可直接互换。'}
                    </p>
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
                  <div className="bpm-field">
                    <NumberField
                      label="BPM"
                      value={activeSegment.bpm}
                      min={0.01}
                      step={0.01}
                      onCommit={(n) => changeSegment({ bpm: n })}
                    />
                    <BpmDetectButton
                      key={activeSegment.id}
                      source={videoSource}
                      start={Math.max(0, videoTimeAt(chart, activeSegment.anchorMs)) / 1000}
                      end={
                        Math.min(
                          duration,
                          ...chart.tempoSegments
                            .filter((segment) => segment.anchorMs > activeSegment.anchorMs)
                            .map((segment) => videoTimeAt(chart, segment.anchorMs)),
                        ) / 1000
                      }
                      bpm={activeSegment.bpm}
                      onDetected={(bpm) => changeSegment({ bpm })}
                      notify={notify}
                    />
                  </div>
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
                <div className="bpm-field">
                  <NumberField
                    label="本段 Offset / ms"
                    value={activeSegment.anchorMs}
                    max={duration}
                    onCommit={(n) => changeSegment({ anchorMs: Math.round(n) })}
                  />
                  <BpmDetectButton
                    key={`first-beat-${activeSegment.id}`}
                    mode="first-beat"
                    beatsPerBar={activeSegment.meter === '3/4' ? 3 : 4}
                    source={videoSource}
                    start={firstBeatSearch.start}
                    end={firstBeatSearch.end}
                    bpm={activeSegment.bpm}
                    anchor={activeSegment.anchorMs}
                    onDetected={(timeMs) =>
                      changeSegment({ anchorMs: Math.round(chartTimeAt(chart, timeMs)) })
                    }
                    notify={notify}
                  />
                </div>
                <button
                  className="text-action"
                  onClick={() => changeSegment({ anchorMs: Math.round(cursorTime()) })}
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
                <details className="chart-credits-fields">
                  <summary>制作署名</summary>
                  {(
                    [
                      ['music', '音乐作者'],
                      ['video', '视频作者'],
                      ['mapper', '谱面作者'],
                    ] as const
                  ).map(([role, label]) => (
                    <TextField
                      key={role}
                      label={label}
                      value={chartCredit(chart, role)}
                      allowEmpty
                      maxLength={240}
                      onCommit={(value) => {
                        if (value !== chartCredit(chart, role))
                          onChange({ ...chart, credits: { ...chart.credits, [role]: value } });
                      }}
                    />
                  ))}
                </details>
                <PlayRangeFields
                  chart={chart}
                  media={media}
                  durationMs={status.durationMs || chart.videoHint.durationMs}
                  onChange={(playRange) => {
                    const next = { ...chart };
                    if (playRange) next.playRange = playRange;
                    else delete next.playRange;
                    onChange(next);
                  }}
                  onLocate={locateEvent}
                  notify={notify}
                />
                {publication}
                {chart.chartType === 'fitness' ? (
                  <label className="field">
                    <span>运动强度</span>
                    <select
                      aria-label="运动强度"
                      value={chart.intensity ?? ''}
                      onChange={(event) =>
                        onChange({
                          ...chart,
                          intensity: (event.target.value || undefined) as
                            ExerciseIntensity | undefined,
                        })
                      }
                    >
                      <option value="">未标注</option>
                      {EXERCISE_INTENSITIES.map((value, index) => (
                        <option key={value} value={value}>
                          {['低', '中', '高'][index]} / {INTENSITY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <NumberField
                    label="舞蹈难度"
                    value={chart.danceDifficulty}
                    min={0}
                    step={0.1}
                    onCommit={(danceDifficulty) => onChange({ ...chart, danceDifficulty })}
                    onClear={() => onChange({ ...chart, danceDifficulty: undefined })}
                  />
                )}
                <NumberField
                  label="视频偏移 / ms"
                  value={chart.videoOffsetMs ?? 0}
                  min={-1000}
                  max={1000}
                  step={1}
                  onCommit={setVideoOffset}
                />
                <div className="inspector-actions">
                  <button disabled={!chart.videoOffsetMs} onClick={() => setVideoOffset(0)}>
                    视频偏移归零
                  </button>
                </div>
                <p className="inspector-tip">
                  正值延后视频，负值提前视频（含声音）。范围 ±1000 ms，随谱面保存；音符时间不变。
                </p>
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
                          ? { name: 'HEART POSE', icon: 'heart', previewBeats: 2 }
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
                          <option value="heart">♡ HEART</option>
                          <option value="star">☆ STAR</option>
                          <option value="sparkles">✦ SPARKLES</option>
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
      {shown.notes.some((n) => n.lane === 'step') && (
        <details className={`step-checks ${stepIssues.length ? 'has-issues' : ''}`}>
          <summary>
            STEP 动作{stepIssues.length ? `：${stepIssues.length} 处需检查` : '检查通过'}{' '}
            <span>检查动作时间重叠</span>
          </summary>
          <div className="step-check-list">
            {stepIssues.length ? (
              stepIssues.map((issue) => (
                <button
                  key={issue.noteId}
                  onClick={() => {
                    setSelected([issue.noteId]);
                    setTab('note');
                    media.seek(videoTimeAt(chart, issue.timeMs));
                    if (scrollRef.current)
                      scrollRef.current.scrollLeft = Math.max(0, issue.timeMs * px - 150);
                  }}
                >
                  <time>{formatTime(issue.timeMs, true)}</time> {issue.message}
                </button>
              ))
            ) : (
              <p>长条结束后再开始下一次踏步；自由摇摆不指定左右方向。</p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
