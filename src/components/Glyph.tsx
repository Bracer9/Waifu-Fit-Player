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
export function NoteGlyph({
  lane,
  direction,
  size = 24,
  distance = 1,
  variant = 'tap',
}: {
  lane: Lane;
  direction: Direction;
  size?: number;
  distance?: StepDistance;
  variant?: 'tap' | 'tip';
}) {
  const shape = lane !== 'step' ? 'arrow' : direction === 'close' ? 'close' : 'step';
  const angle = { up: 0, right: 90, down: 180, left: 270, close: 0 }[direction];
  return (
    <svg
      className={`note-glyph glyph--${shape}`}
      data-symbol={noteSymbol(lane, direction, distance)}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      {shape === 'arrow' ? (
        <g transform={`rotate(${angle} 20 20)`}>
          <path
            className="glyph-body"
            d={variant === 'tip' ? 'M20 4L34 27L20 21L6 27Z' : 'M20 3L36 19H26V36H14V19H4Z'}
          />
          <path
            className="glyph-inset"
            d={variant === 'tip' ? 'M20 10L28 23L20 18L12 23Z' : 'M20 8L30 18H23V32H17V18H10Z'}
          />
        </g>
      ) : shape === 'step' ? (
        <>
          <circle className="glyph-ring" cx="20" cy="20" r="16.5" />
          <path
            className="glyph-mark"
            d={
              distance === 2
                ? 'M19 13L26 20L19 27M11 13L18 20L11 27'
                : 'M11 20H28M21 13L28 20L21 27'
            }
            transform={direction === 'left' ? 'rotate(180 20 20)' : undefined}
          />
        </>
      ) : (
        <>
          <path
            className="glyph-body"
            d="M4 9L15 20L4 31L1 28L9 20L1 12ZM36 9L25 20L36 31L39 28L31 20L39 12Z"
          />
          <circle className="glyph-core" cx="20" cy="20" r="2.5" />
        </>
      )}
    </svg>
  );
}
