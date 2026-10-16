import {
  isPunchAction,
  noteSymbol,
  type ArmAction,
  type Direction,
  type Lane,
  type StepDistance,
} from '../model';
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
export function noteGlyphShape(
  lane: Lane,
  direction: Direction,
  distance: StepDistance = 1,
  action?: ArmAction,
) {
  const shape = isPunchAction(lane, direction, action)
    ? 'glove'
    : lane !== 'step'
      ? 'arrow'
      : direction === 'free'
        ? 'free'
        : 'step';
  const angle =
    shape === 'glove'
      ? 0
      : {
          up: 0,
          up_right: 45,
          right: 90,
          down_right: 135,
          down: 180,
          down_left: 225,
          left: 270,
          up_left: 315,
          free: 0,
        }[direction];
  const path =
    shape === 'glove'
      ? 'M13 5Q20 1 29 5Q34 7 34 14V22Q34 26 29 29L28 36H13L12 29Q5 28 4 22V18Q4 14 8 14Q11 14 12 18V11Q12 7 13 5Z'
      : shape === 'free'
        ? 'M20 15C16 10 13 9 10 9C-3 9 -3 31 10 31C13 31 16 30 20 25C24 30 27 31 30 31C43 31 43 9 30 9C27 9 24 10 20 15ZM15 20C12 16 11 15 9 15C4 15 4 25 9 25C11 25 12 24 15 20ZM25 20C28 16 29 15 31 15C36 15 36 25 31 25C29 25 28 24 25 20Z'
        : shape === 'step' && distance === 2
          ? 'M7 17L20 4L33 17L28 22L20 14L12 22ZM7 29L20 16L33 29L28 34L20 26L12 34Z'
          : lane === 'side_crunch'
            ? 'M20 1L37 19H28V38H12V19H3Z'
            : 'M20 4L34 18H26V35H14V18H6Z';
  return { shape, angle, path };
}

export function GlyphLabel({
  lane,
  direction,
  armAction,
}: {
  lane: Lane;
  direction: Direction;
  armAction?: ArmAction;
}) {
  return isPunchAction(lane, direction, armAction) ? (
    <text className="glove-letter" x="23" y="23" textAnchor="middle">
      {direction === 'left' ? 'L' : 'R'}
    </text>
  ) : null;
}

export function PunchPair({
  joined = false,
  ribbon = false,
}: {
  joined?: boolean;
  ribbon?: boolean;
}) {
  const path = noteGlyphShape('punch', 'left').path;
  return (
    <g className="punch-pair">
      {(['left', 'right'] as const).map((direction, i) => (
        <g
          key={direction}
          transform={`translate(${i ? 19 : -13} 4) scale(0.8)`}
          style={
            {
              '--lane': direction === 'left' ? 'var(--cyan)' : 'var(--pink)',
            } as React.CSSProperties
          }
        >
          {!joined && !ribbon && <path className="glyph-edge" d={path} />}
          <path className={ribbon ? 'ribbon-pair-body' : 'glyph-body'} d={path} />
          <GlyphLabel lane="punch" direction={direction} armAction="punch" />
        </g>
      ))}
    </g>
  );
}

/** A shoe-sole print with a rounded toe, tread grooves and a separate heel. */
export function ShoePrint() {
  return (
    <path
      className="shoe-print"
      fillRule="evenodd"
      d="M19 2C11 2 7 8 7 15C7 20 10 23 13 25C15 27 15 28 15 29H25C24 25 26 21 28 17C31 9 26 2 19 2ZM11 10Q18 7 25 10L24.5 12Q18 9 11.5 12ZM10.5 16L24 18L23.5 20L11 18ZM15 32H25V35C25 41 14 41 14 35Z"
    />
  );
}

/** An upright open palm, shared by both punch-sway directions. */
export function PalmPrint() {
  return (
    <path
      className="palm-print"
      d="M14 23L8 17Q6 15 4 17Q3 18 4 20L12 32Q15 37 21 37H24Q34 37 34 27V15Q34 12 31.5 12Q29 12 29 15V20V9Q29 6 26.5 6Q24 6 24 9V18V5Q24 2 21.5 2Q19 2 19 5V18V8Q19 5 16.5 5Q14 5 14 8Z"
    />
  );
}
/** Two broad, stemless downward arrowheads for squat holds (about 120 degrees). */
export function SquatDownCue() {
  return <path className="squat-down-cue" d="M4 9L20 18L36 9M4 22L20 31L36 22" />;
}
export function NoteGlyph({
  lane,
  direction,
  size = 24,
  distance = 1,
  variant = 'tap',
  joined = false,
  follow = false,
  armAction,
  pairedPunch = false,
}: {
  lane: Lane;
  direction: Direction;
  size?: number;
  distance?: StepDistance;
  variant?: 'tap' | 'tip';
  joined?: boolean;
  follow?: boolean;
  armAction?: ArmAction;
  pairedPunch?: boolean;
}) {
  const { shape, angle, path } = noteGlyphShape(lane, direction, distance, armAction);
  return (
    <svg
      className={`note-glyph glyph--${shape} glyph--${variant}${joined ? ' glyph--joined' : ''}${follow ? ' glyph--follow' : ''}`}
      data-symbol={`${follow ? 'FOLLOW ' : ''}${noteSymbol(lane, direction, distance, armAction)}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <g transform={shape === 'free' || shape === 'glove' ? undefined : `rotate(${angle} 20 20)`}>
        {pairedPunch ? (
          <PunchPair joined={joined} />
        ) : follow ? (
          // Keep the arrow tip intact; only the hollow stem is broken into clear segments.
          ['follow-edge', 'follow-color', 'follow-core'].map((className) => (
            <path
              key={className}
              className={className}
              d="M14 18H6L20 4L34 18H26 M26 25V28 M24 35H16 M14 28V25"
            />
          ))
        ) : (
          <>
            {!joined && <path className="glyph-edge" fillRule="evenodd" d={path} />}
            <path className="glyph-body" fillRule="evenodd" d={path} />
            <GlyphLabel lane={lane} direction={direction} armAction={armAction} />
          </>
        )}
      </g>
    </svg>
  );
}
