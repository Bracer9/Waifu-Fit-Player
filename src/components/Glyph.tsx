import {
  isPunchAction,
  noteSymbol,
  type ArmAction,
  type ArmHand,
  type Direction,
  type Lane,
  type StepDistance,
  type SpinDirection,
} from '../model';
// The base silhouettes have the thumb on the viewer's left (a right hand).
const PALM_PATH =
  'M14 23L8 17Q6 15 4 17Q3 18 4 20L12 32Q15 37 21 37H24Q34 37 34 27V15Q34 12 31.5 12Q29 12 29 15V20V9Q29 6 26.5 6Q24 6 24 9V18V5Q24 2 21.5 2Q19 2 19 5V18V8Q19 5 16.5 5Q14 5 14 8Z';
const laneFigures: Record<Lane, React.ReactNode> = {
  squat: (
    <>
      <circle cx="24" cy="9" r="6.5" />
      <g fill="none" stroke="currentColor">
        <path d="M20 21L15 34H28L22 49H28" strokeWidth="7.5" />
        <path d="M20 21H44" strokeWidth="6.5" />
      </g>
    </>
  ),
  calf_raise: (
    <path d="M23 3L36 4L31 29C30 34 32 41 35 46Q37 49 41 48Q45 48 44 51Q43 54 38 54C31 54 28 47 25 43L18 36Q14 33 17 29Q20 26 20 22Z" />
  ),
  punch: (
    <>
      <circle cx="25" cy="10" r="6.5" />
      <g fill="none" stroke="currentColor">
        <path d="M23 22L22 33" strokeWidth="9" />
        <path d="M22 33L15 41L11 50M22 33L31 40L34 50" strokeWidth="7.5" />
        <path d="M24 22L47 19" strokeWidth="7" />
        <path d="M21 22L9 29L14 18" strokeWidth="6" />
      </g>
    </>
  ),
  step: (
    <g transform="translate(3 2) scale(1.3)">
      <ShoePrint />
    </g>
  ),
  side_crunch: (
    <>
      <circle cx="30" cy="14" r="6" />
      <g fill="none" stroke="currentColor">
        <path d="M24 5L12 12L26 25M40 14L44 23L29 27" strokeWidth="5.5" />
        <path d="M27 25L24 35L23 50M25 36L37 33L31 44" strokeWidth="7" />
      </g>
    </>
  ),
};

export function LaneGlyph({ lane }: { lane: Lane }) {
  return (
    <svg
      viewBox="0 0 56 56"
      fill="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {laneFigures[lane]}
    </svg>
  );
}
export function noteGlyphShape(
  lane: Lane,
  direction: Direction,
  distance: StepDistance = 1,
  action?: ArmAction,
  hand?: ArmHand,
  legHold = false,
  spinDirection: SpinDirection = 'clockwise',
) {
  const shape =
    lane === 'punch' && action === 'clap'
      ? 'clap'
      : lane === 'punch' && action === 'forward'
        ? 'palm'
        : isPunchAction(lane, direction, action)
          ? 'glove'
          : lane !== 'step'
            ? 'arrow'
            : direction === 'free'
              ? 'spin'
              : 'step';
  const angle =
    shape === 'glove' || shape === 'palm' || shape === 'clap' || legHold
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
          forward: 0,
        }[direction];
  const path =
    shape === 'palm'
      ? PALM_PATH
      : shape === 'glove'
        ? 'M13 5Q20 1 29 5Q34 7 34 14V22Q34 26 29 29L28 36H13L12 29Q5 28 4 22V18Q4 14 8 14Q11 14 12 18V11Q12 7 13 5Z'
        : shape === 'spin'
          ? 'M30 6V1L39 10L30 19V13C27.8 9.9 24.1 8 20 8C13.4 8 8 13.4 8 20C8 26.6 13.4 32 20 32C25.7 32 30.5 28 31.7 22.7L37.6 24C35.8 32 28.6 38 20 38C10.1 38 2 29.9 2 20C2 10.1 10.1 2 20 2C23.7 2 27.1 3.1 30 5Z'
          : shape === 'step' && distance === 2 && !legHold
            ? 'M7 17L20 4L33 17L28 22L20 14L12 22ZM7 29L20 16L33 29L28 34L20 26L12 34Z'
            : lane === 'side_crunch'
              ? 'M20 1L37 19H28V38H12V19H3Z'
              : 'M20 4L34 18H26V35H14V18H6Z';
  const mirror =
    shape === 'spin'
      ? spinDirection === 'counterclockwise'
      : shape === 'glove'
        ? direction === 'left'
        : shape === 'palm' && hand === 'left';
  return { shape, angle, path, mirror };
}

export function GlyphLabel({
  lane,
  direction,
  armAction,
  hand,
}: {
  lane: Lane;
  direction: Direction;
  armAction?: ArmAction;
  hand?: ArmHand;
}) {
  const palm = lane === 'punch' && armAction === 'forward';
  const left = palm ? hand === 'left' : direction === 'left';
  return isPunchAction(lane, direction, armAction) || (palm && hand !== 'both') ? (
    <text
      className={`glove-letter${palm ? ' palm-letter' : ''}`}
      x={left ? 17 : 23}
      y={palm ? 30 : 23}
      textAnchor="middle"
    >
      {left ? 'L' : 'R'}
    </text>
  ) : null;
}

export function PunchPair({
  joined = false,
  ribbon = false,
  palms = false,
}: {
  joined?: boolean;
  ribbon?: boolean;
  palms?: boolean;
}) {
  const path = noteGlyphShape(
    'punch',
    palms ? 'forward' : 'right',
    1,
    palms ? 'forward' : 'punch',
  ).path;
  return (
    <g className={palms ? 'palm-pair' : 'punch-pair'}>
      {(['left', 'right'] as const).map((direction, i) => (
        <g
          key={direction}
          transform={
            palms
              ? `translate(${i ? 21 : -1} 4) scale(0.52 0.85)`
              : `translate(${i ? 19 : -13} 4) scale(0.8)`
          }
          style={
            {
              '--lane': palms
                ? 'var(--arms-both)'
                : direction === 'left'
                  ? 'var(--cyan)'
                  : 'var(--pink)',
            } as React.CSSProperties
          }
        >
          {!joined && !ribbon && (
            <path
              className="glyph-edge"
              d={path}
              transform={direction === 'left' ? 'translate(40 0) scale(-1 1)' : undefined}
            />
          )}
          <path
            className={ribbon ? 'ribbon-pair-body' : 'glyph-body'}
            d={path}
            transform={direction === 'left' ? 'translate(40 0) scale(-1 1)' : undefined}
          />
          {!palms && <GlyphLabel lane="punch" direction={direction} armAction="punch" />}
        </g>
      ))}
    </g>
  );
}

/** Phosphor hands-clapping (MIT); attribution in assets/icons/PHOSPHOR-LICENSE.txt. */
export function ClapGlyph({
  joined = false,
  ribbon = false,
}: {
  joined?: boolean;
  ribbon?: boolean;
}) {
  const path =
    'M29.511 10.156A2.813 2.813 0 0 0 24.628 12.969L20.838 6.406a2.813 2.813 0 0 0 -4.878 2.813L15.063 7.656A2.813 2.813 0 0 0 10.184 10.469l0.522 0.902A4.063 4.063 0 0 0 6.209 17.344l0.469 0.813A4.063 4.063 0 0 0 3.672 24.219l5.511 9.531a12.522 12.522 0 0 0 23.363 -6.183A11.238 11.238 0 0 0 32.813 15.872Zm0.188 19.931A10.019 10.019 0 0 1 11.352 32.5L5.841 22.969a1.563 1.563 0 0 1 2.709 -1.563L11.719 26.875a1.25 1.25 0 0 0 2.167 -1.25L8.378 16.094A1.563 1.563 0 0 1 11.094 14.531l4.97 8.594a1.25 1.25 0 0 0 2.167 -1.25l-4.063 -7.031a1.563 1.563 0 0 1 2.711 -1.563l5.703 9.844a1.25 1.25 0 0 0 2.167 -1.25l-1.969 -3.398A1.563 1.563 0 0 1 25.538 17.031l3.159 5.469A9.925 9.925 0 0 1 29.698 30.089ZM25.034 3.75V1.25a1.25 1.25 0 0 1 2.5 0V3.75a1.25 1.25 0 0 1 -2.5 0Zm5.191 0.938 1.25 -2.047a1.25 1.25 0 0 1 2.138 1.302l-1.25 2.048a1.25 1.25 0 0 1 -1.069 0.598A1.25 1.25 0 0 1 30.225 4.688Zm7.031 5.259 -2.352 0.758a1.273 1.273 0 0 1 -0.384 0.061 1.25 1.25 0 0 1 -0.384 -2.441l2.353 -0.758a1.25 1.25 0 1 1 0.767 2.38Z';
  return (
    <g className="clap-hands">
      {!joined && !ribbon && <path className="glyph-edge" d={path} style={{ strokeWidth: 3 }} />}
      <path
        className={ribbon ? 'ribbon-pair-body' : 'glyph-body'}
        d={path}
        style={{ strokeWidth: 1 }}
      />
    </g>
  );
}

export function ReachPair({
  joined = false,
  ribbon = false,
}: {
  joined?: boolean;
  ribbon?: boolean;
}) {
  const path = 'M12 8L0 20L12 32V25H28V32L40 20L28 8V15H12Z';
  return (
    <g className="reach-pair">
      {!joined && !ribbon && <path className="glyph-edge" d={path} />}
      <path className={ribbon ? 'ribbon-pair-body' : 'glyph-body'} d={path} />
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

/** An upright open palm, shared by ARMS hold and sway ribbon cues. */
export function PalmPrint() {
  return <path className="palm-print" d={PALM_PATH} />;
}
/** Two broad, stemless downward arrowheads for squat holds (about 120 degrees). */
export function SquatDownCue() {
  return <path className="squat-down-cue" d="M4 9L20 18L36 9M4 22L20 31L36 22" />;
}
/** The same hollow chevrons as squat holds, pointing up for raised legs. */
export function LegUpCue() {
  return (
    <g className="leg-up-cue" transform="rotate(180 20 20)">
      <SquatDownCue />
    </g>
  );
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
  hand,
  pairedPunch = false,
  pairedReach = false,
  legHold = false,
  spinDirection,
}: {
  lane: Lane;
  direction: Direction;
  size?: number;
  distance?: StepDistance;
  variant?: 'tap' | 'tip';
  joined?: boolean;
  follow?: boolean;
  armAction?: ArmAction;
  hand?: ArmHand;
  pairedPunch?: boolean;
  pairedReach?: boolean;
  legHold?: boolean;
  spinDirection?: SpinDirection;
}) {
  const { shape, angle, path, mirror } = noteGlyphShape(
    lane,
    direction,
    distance,
    armAction,
    hand,
    legHold,
    spinDirection,
  );
  return (
    <svg
      className={`note-glyph glyph--${shape} glyph--${variant}${joined ? ' glyph--joined' : ''}${follow ? ' glyph--follow' : ''}`}
      data-symbol={
        pairedReach
          ? '↔'
          : armAction === 'forward'
            ? `FWD ${hand === 'both' ? 'BOTH' : hand === 'right' ? 'R' : 'L'}`
            : legHold
              ? 'LEG HOLD'
              : `${follow ? 'FOLLOW ' : ''}${noteSymbol(lane, direction, distance, armAction)}`
      }
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      data-spin-direction={shape === 'spin' ? (spinDirection ?? 'clockwise') : undefined}
    >
      <g
        transform={
          pairedReach ||
          shape === 'spin' ||
          shape === 'glove' ||
          shape === 'palm' ||
          shape === 'clap'
            ? undefined
            : `rotate(${angle} 20 20)`
        }
      >
        {shape === 'clap' ? (
          <ClapGlyph joined={joined} />
        ) : shape === 'palm' && hand === 'both' ? (
          <PunchPair palms joined={joined} />
        ) : pairedReach ? (
          <ReachPair joined={joined} />
        ) : pairedPunch ? (
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
            {!joined && (
              <path
                className="glyph-edge"
                fillRule="evenodd"
                d={path}
                transform={mirror ? 'translate(40 0) scale(-1 1)' : undefined}
              />
            )}
            <path
              className="glyph-body"
              fillRule="evenodd"
              d={path}
              transform={mirror ? 'translate(40 0) scale(-1 1)' : undefined}
            />
            <GlyphLabel lane={lane} direction={direction} armAction={armAction} hand={hand} />
          </>
        )}
      </g>
    </svg>
  );
}
