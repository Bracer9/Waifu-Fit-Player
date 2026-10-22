import { useEffect, useState, type CSSProperties } from 'react';
import { AFTER_SHOW_FINISH } from '../after-show';

const colors = ['#f64e93', '#32c6d3', '#fff1e6', '#ffd15c'];
const pieces = [-1, 1].flatMap((side) =>
  Array.from({ length: AFTER_SHOW_FINISH.piecesPerSide }, (_, index) => {
    const spread = (index * 17) % 29;
    return {
      side,
      style: {
        '--confetti-x': `calc(var(--menu-vw, 1vw) * ${-side * (13 + spread)})`,
        '--confetti-lift': `calc(var(--menu-vh, 1vh) * ${-(18 + ((index * 11) % 30))})`,
        '--confetti-turn': `${side * (360 + index * 57)}deg`,
        '--confetti-color': colors[index % colors.length],
        width: `${6 + (index % 6)}px`,
        height: `${12 + ((index * 7) % 24)}px`,
        animationDelay: `${(index % 7) * 19}ms`,
        animationDuration: `${1700 + (index % 5) * 80}ms`,
      } as CSSProperties,
    };
  }),
);

/** One CSS burst per finish, no particle engine, per-frame JS or retained emitter. */
export function AfterShowCelebration() {
  const [visible, setVisible] = useState(
    () => !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), AFTER_SHOW_FINISH.confettiMs);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="after-show-celebration" aria-hidden="true">
      <span className="after-show-pop left" />
      <span className="after-show-pop right" />
      {pieces.map(({ side, style }, index) => (
        <i
          key={index}
          className={`after-show-confetti ${side === -1 ? 'left' : 'right'}`}
          style={style}
        />
      ))}
    </div>
  );
}
