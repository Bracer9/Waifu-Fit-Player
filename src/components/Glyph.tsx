import { noteSymbol, type Direction, type Lane, type StepDistance } from '../model';
export function LaneGlyph({ lane }: { lane: Lane }) {
  const paths: Record<Lane, string> = {
    squat: 'M21 20L14 31L28 34L20 48M21 22L35 25L43 25M14 31L8 43L24 48',
    calf_raise:
      'M26 20L25 33L21 47M25 33L31 47M25 22L15 31M25 22L34 31M12 48V39M8 43L12 39L16 43M39 48V39M35 43L39 39L43 43',
    punch: 'M24 21L23 34L13 48M23 34L32 48M24 22L34 25L46 25M24 22L14 28L10 22',
    step: 'M26 21L26 33L17 44M26 33L35 44M26 22L16 28M26 22L36 28M5 43H13M9 39L5 43L9 47M43 43H51M47 39L51 43L47 47',
    side_crunch: 'M26 21L22 34L18 48M22 34L31 48M26 21L34 13L29 7M25 22L16 15L20 7',
  };
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <circle
        cx={lane === 'squat' ? 27 : 26}
        cy={lane === 'squat' ? 12 : 11}
        r="5"
        fill="currentColor"
      />
      <path
        d={paths[lane]}
        stroke="currentColor"
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function noteGlyphShape(lane: Lane, direction: Direction, distance: StepDistance = 1) {
  const shape = lane !== 'step' ? 'arrow' : direction === 'free' ? 'free' : 'step';
  const angle = { up: 0, right: 90, down: 180, left: 270, free: 0 }[direction];
  const path =
    shape === 'free'
      ? 'M20 15C16 10 13 9 10 9C-3 9 -3 31 10 31C13 31 16 30 20 25C24 30 27 31 30 31C43 31 43 9 30 9C27 9 24 10 20 15ZM15 20C12 16 11 15 9 15C4 15 4 25 9 25C11 25 12 24 15 20ZM25 20C28 16 29 15 31 15C36 15 36 25 31 25C29 25 28 24 25 20Z'
      : shape === 'step' && distance === 2
        ? 'M7 17L20 4L33 17L28 22L20 14L12 22ZM7 29L20 16L33 29L28 34L20 26L12 34Z'
        : 'M20 4L34 18H26V35H14V18H6Z';
  return { shape, angle, path };
}
export function NoteGlyph({
  lane,
  direction,
  size = 24,
  distance = 1,
  variant = 'tap',
  joined = false,
}: {
  lane: Lane;
  direction: Direction;
  size?: number;
  distance?: StepDistance;
  variant?: 'tap' | 'tip';
  joined?: boolean;
}) {
  const { shape, angle, path } = noteGlyphShape(lane, direction, distance);
  return (
    <svg
      className={`note-glyph glyph--${shape} glyph--${variant}${joined ? ' glyph--joined' : ''}`}
      data-symbol={noteSymbol(lane, direction, distance)}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <g transform={shape === 'free' ? undefined : `rotate(${angle} 20 20)`}>
        {!joined && <path className="glyph-edge" fillRule="evenodd" d={path} />}
        <path className="glyph-body" fillRule="evenodd" d={path} />
      </g>
    </svg>
  );
}
