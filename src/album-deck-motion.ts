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
  const inset = world.map(([x, y]) => {
    const dx = width * 0.9 - x,
      dy = height * 0.55 - y;
    const length = Math.hypot(dx, dy);
    return toLocal([x + (dx / length) * 8, y + (dy / length) * 8]);
  });
  return {
    clip: `polygon(${local.map(({ x, y }) => `${x.toFixed(3)}px ${y.toFixed(3)}px`).join(',')})`,
    outline: inset
      .map(
        ({ x, y }) =>
          `${((x / boxWidth) * 1000).toFixed(3)},${((y / boxHeight) * 1000).toFixed(3)}`,
      )
      .join(' '),
  };
}
