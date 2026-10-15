import { noteSymbol, type Direction, type Lane, type StepDistance } from '../model';
export function DirectionGlyph({ direction, size = 24 }: { direction: Direction; size?: number }) {
  const angle = { up: 0, right: 90, down: 180, left: 270, close: 0 }[direction];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 27V6M6 16L16 6L26 16"
        transform={`rotate(${angle} 16 16)`}
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
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
}: {
  lane: Lane;
  direction: Direction;
  size?: number;
  distance?: StepDistance;
}) {
  if (lane !== 'step') return <DirectionGlyph direction={direction} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontFamily="'Barlow Condensed', Arial, sans-serif"
        fontWeight="800"
        fontSize="30"
      >
        {noteSymbol(lane, direction, distance)}
      </text>
    </svg>
  );
}
