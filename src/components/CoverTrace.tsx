export function CoverTrace({
  inset = 1,
  pixelUnits = false,
}: {
  inset?: number;
  pixelUnits?: boolean;
}) {
  const position = pixelUnits ? `${inset}%` : inset;
  const size = pixelUnits ? `${100 - inset * 2}%` : 100 - inset * 2;
  return (
    <svg
      className="cover-trace"
      viewBox={pixelUnits ? undefined : '0 0 100 100'}
      data-pixel-units={pixelUnits || undefined}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x={position} y={position} width={size} height={size} pathLength="100" />
      <rect x={position} y={position} width={size} height={size} pathLength="100" />
    </svg>
  );
}
