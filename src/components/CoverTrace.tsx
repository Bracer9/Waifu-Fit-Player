export function CoverTrace({ inset = 1 }: { inset?: number }) {
  return (
    <svg
      className="cover-trace"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x={inset} y={inset} width={100 - inset * 2} height={100 - inset * 2} pathLength="100" />
      <rect x={inset} y={inset} width={100 - inset * 2} height={100 - inset * 2} pathLength="100" />
    </svg>
  );
}
