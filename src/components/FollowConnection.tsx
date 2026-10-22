import type { Note } from '../model';
import { noteX } from '../timing';
import { ShoePrint } from './Glyph';

export function FollowConnection({
  previous,
  follow,
  time,
  previewMs,
  width,
  size,
}: {
  previous: Note;
  follow: Note;
  time: number;
  previewMs: number;
  width: number;
  size: number;
}) {
  const from = (noteX(previous.timeMs, time, 88, previewMs) * width) / 100;
  const to = (noteX(follow.timeMs, time, 88, previewMs) * width) / 100;
  const limit = width * 0.88;
  const height = size * 1.08;
  const cueSize = (size / 1.25) * 0.82;
  const middle = (from + to) / 2;
  const gap = size * 0.42;
  const start = Math.max(0, to + gap);
  const end = Math.min(limit, previous.timeMs <= time ? limit : from - gap);
  const cueGap = cueSize * 0.6;
  const leftEnd = Math.min(end, middle - cueGap);
  const rightStart = Math.max(start, middle + cueGap);
  if (width <= 0) return null;
  return (
    <svg
      className="follow-connection"
      viewBox={`0 0 ${limit} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
      data-follow-id={follow.id}
      data-previous-id={previous.id}
    >
      {leftEnd > start && <line x1={start} x2={leftEnd} y1={height / 2} y2={height / 2} />}
      {end > rightStart && <line x1={rightStart} x2={end} y1={height / 2} y2={height / 2} />}
      {middle + cueSize / 2 > 0 && middle - cueSize / 2 < limit && (
        <g
          transform={`translate(${middle - cueSize / 2} ${(height - cueSize) / 2}) scale(${cueSize / 40})`}
        >
          <ShoePrint />
        </g>
      )}
    </svg>
  );
}
