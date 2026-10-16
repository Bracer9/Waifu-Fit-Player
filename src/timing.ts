import type { Chart, Note, Snap, TempoSegment } from './model';
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
/** Positive offset delays video relative to the chart; the media clock stays authoritative. */
export const chartTimeAt = (chart: Pick<Chart, 'videoOffsetMs'>, videoTimeMs: number) =>
  videoTimeMs + (chart.videoOffsetMs ?? 0);
export const videoTimeAt = (chart: Pick<Chart, 'videoOffsetMs'>, chartTimeMs: number) =>
  chartTimeMs - (chart.videoOffsetMs ?? 0);
export function segmentAt(segments: TempoSegment[], timeMs: number): TempoSegment | undefined {
  return segments.filter((s) => s.anchorMs <= timeMs).sort((a, b) => b.anchorMs - a.anchorMs)[0];
}
export function snapTime(
  timeMs: number,
  segments: TempoSegment[],
  snap: Snap,
  duration = Infinity,
): number {
  const time = clamp(timeMs, 0, duration);
  if (!snap) return Math.round(time);
  const sorted = [...segments].sort((a, b) => a.anchorMs - b.anchorMs);
  const segment = segmentAt(sorted, time);
  if (!segment) return Math.round(time);
  const index = sorted.indexOf(segment);
  const next = sorted[index + 1]?.anchorMs ?? Infinity;
  const step = 60000 / segment.bpm / snap;
  const position = (time - segment.anchorMs) / step;
  const candidates = [Math.floor(position), Math.ceil(position)]
    .map((k) => segment.anchorMs + k * step)
    .filter((t) => t >= segment.anchorMs && t < next && t <= duration);
  return Math.round(
    candidates.reduce(
      (a, b) => (Math.abs(b - time) < Math.abs(a - time) ? b : a),
      candidates[0] ?? time,
    ),
  );
}
export function nextGrid(
  timeMs: number,
  segments: TempoSegment[],
  snap: Snap,
  duration = Infinity,
): number {
  const s = segmentAt(segments, timeMs);
  const step = s ? 60000 / s.bpm / (snap || 1) : 500;
  const base = s?.anchorMs ?? 0;
  const regular = base + (Math.floor((timeMs - base) / step + 0.00001) + 1) * step;
  const nextAnchor = Math.min(
    ...segments.filter((seg) => seg.anchorMs > timeMs).map((seg) => seg.anchorMs),
  );
  return Math.round(Math.min(regular, nextAnchor, duration));
}
export type GridLine = { timeMs: number; type: 'bar' | 'beat' | 'sub'; label: string };
export function gridLines(
  segments: TempoSegment[],
  from: number,
  to: number,
  subdivisions: Snap,
): GridLine[] {
  const sorted = [...segments].sort((a, b) => a.anchorMs - b.anchorMs);
  const lines: GridLine[] = [];
  sorted.forEach((s, i) => {
    const div = subdivisions || 1;
    const step = 60000 / s.bpm / div;
    const end = Math.min(to, sorted[i + 1]?.anchorMs ?? Infinity);
    const meter = s.meter === '3/4' ? 3 : 4;
    for (
      let n = Math.max(0, Math.ceil((from - s.anchorMs) / step));
      n * step + s.anchorMs <= end && lines.length < 4000;
      n++
    ) {
      const timeMs = s.anchorMs + n * step;
      if (timeMs >= (sorted[i + 1]?.anchorMs ?? Infinity)) break;
      const type = n % (div * meter) === 0 ? 'bar' : n % div === 0 ? 'beat' : 'sub';
      lines.push({ timeMs, type, label: `${i + 1}.${Math.floor(n / (div * meter)) + 1}` });
    }
  });
  return lines;
}
export function noteState(note: Note, timeMs: number): 'waiting' | 'holding' | 'ended' {
  return timeMs < note.timeMs
    ? 'waiting'
    : note.kind === 'hold' && timeMs < note.endTimeMs
      ? 'holding'
      : 'ended';
}
export function noteX(
  noteTime: number,
  currentTime: number,
  hitX: number,
  previewMs: number,
): number {
  return hitX - ((noteTime - currentTime) / previewMs) * hitX;
}
export function specialAt(chart: Chart, timeMs: number) {
  if (!chart.specialMove) return null;
  for (const event of chart.specialEvents) {
    const bpm = segmentAt(chart.tempoSegments, event.timeMs)?.bpm ?? 120;
    const preview = (chart.specialMove.previewBeats * 60000) / bpm;
    const end = event.endTimeMs ?? event.timeMs + 700;
    if (timeMs >= event.timeMs - preview && timeMs < end)
      return {
        event,
        active: timeMs >= event.timeMs,
        progress: clamp((timeMs - event.timeMs + preview) / preview, 0, 1),
      };
  }
  return null;
}
export function formatTime(ms: number, precise = false): string {
  const safe = Math.max(0, Math.round(ms));
  return `${String(Math.floor(safe / 60000)).padStart(2, '0')}:${String(Math.floor(safe / 1000) % 60).padStart(2, '0')}${precise ? '.' + String(safe % 1000).padStart(3, '0') : ''}`;
}

/** Ruler labels use segment.bar; a third number optionally selects a beat. */
export function parseTimelinePosition(value: string, segments: TempoSegment[]): number | undefined {
  const text = value.trim();
  const time = /^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/.exec(text);
  if (time)
    return (
      Number(time[1]) * 60000 + Number(time[2]) * 1000 + Number((time[3] ?? '').padEnd(3, '0'))
    );
  const milliseconds = /^(\d+)\s*ms$/i.exec(text);
  if (milliseconds) return Number(milliseconds[1]);
  const position = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(text);
  if (!position) return undefined;
  const sorted = [...segments].sort((a, b) => a.anchorMs - b.anchorMs);
  const index = position[2] === undefined ? 0 : Number(position[1]) - 1;
  const bar = Number(position[2] ?? position[1]);
  const beat = Number(position[3] ?? 1);
  const segment = sorted[index];
  if (!segment) return undefined;
  const meter = segment.meter === '3/4' ? 3 : 4;
  if (bar < 1 || beat < 1 || beat > meter) return undefined;
  const result = segment.anchorMs + (((bar - 1) * meter + beat - 1) * 60000) / segment.bpm;
  if (!Number.isFinite(result) || result >= (sorted[index + 1]?.anchorMs ?? Infinity))
    return undefined;
  return Math.round(result);
}
