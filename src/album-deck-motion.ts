/** Counter-map the open housing into the original -33deg corner's local paint space.
 * Only its outline morphs: the actual corner never tips or rocks as it descends.
 */
export function albumHousingOutline(width: number, height: number) {
  const boxWidth = width * 0.36;
  const boxHeight = height * 1.3;
  const origin = { x: width * 0.89, y: height * 0.58 };
  const angle = (33 * Math.PI) / 180;
  const world = [
    [width * 0.7712, -height * 0.07],
    [width * 1.07, -height * 0.07],
    [width * 1.07, height * 1.23],
    [width * 0.71, height * 0.957],
    [width * 0.71, height * 0.359],
    [width * 0.7712, -height * 0.07],
  ];
  const toLocal = ([x, y]: number[]) => {
    const dx = x - origin.x;
    const dy = y - origin.y;
    return {
      x: boxWidth / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: boxHeight / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  };
  const local = world.map(toLocal);
  const points = (vertices: { x: number; y: number }[]) =>
    vertices
      .map(
        ({ x, y }) =>
          `${((x / boxWidth) * 1000).toFixed(3)},${((y / boxHeight) * 1000).toFixed(3)}`,
      )
      .join(' ');
  const inset = world.map(([x, y]) => {
    const dx = width * 0.9 - x,
      dy = height * 0.55 - y;
    const length = Math.hypot(dx, dy);
    return toLocal([x + (dx / length) * 8, y + (dy / length) * 8]);
  });
  // Shrink only the closed silhouette about the viewport's top-right corner.
  // The inverse includes the open state's existing 2vw / 83vh translation;
  // neither the corner's music transform nor the open player geometry changes.
  const anchor = toLocal([width * 1.02, height * 0.83]);
  const closed = [
    [0, 0],
    [boxWidth, 0],
    [boxWidth, boxHeight],
    [0, boxHeight],
    [0, boxHeight / 2],
    [0, 0],
  ].map(([x, y]) => ({
    x: anchor.x + (x - anchor.x) * Math.sqrt(0.75),
    y: anchor.y + (y - anchor.y) * Math.sqrt(0.75),
  }));
  return {
    closedPoints: points(closed),
    closedClip: `polygon(${closed.map(({ x, y }) => `${x.toFixed(3)}px ${y.toFixed(3)}px`).join(',')})`,
    points: points(local),
    clip: `polygon(${local.map(({ x, y }) => `${x.toFixed(3)}px ${y.toFixed(3)}px`).join(',')})`,
    outline: points(inset),
  };
}
