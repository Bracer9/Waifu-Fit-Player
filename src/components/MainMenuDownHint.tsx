import { useEffect, useState, type CSSProperties } from 'react';

export const MAIN_MENU_DOWN_HINT = {
  idleDelay: 5500,
  floatDistance: 3,
  pulseDuration: 3400,
  accentPink: 'var(--pink)',
  accentCyan: 'var(--cyan)',
} as const;

// Offer the idle nudge once per app session, rather than on every return home.
let offeredIdleHint = false;

export function MenuHintArrows() {
  return (
    <svg className="main-menu-down-hint-arrows" viewBox="0 0 40 44" focusable="false">
      <path className="main-menu-down-hint-pink" d="M6 8 20 20 34 8" />
      <path className="main-menu-down-hint-cyan" d="M6 26 20 38 34 26" />
    </svg>
  );
}

export function MainMenuDownHint() {
  const [accent, setAccent] = useState(false);
  useEffect(() => {
    if (offeredIdleHint || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    offeredIdleHint = true;
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
    const removeListeners = () =>
      events.forEach((event) => window.removeEventListener(event, stop));
    const stop = () => {
      window.clearTimeout(timer);
      setAccent(false);
      removeListeners();
    };
    const timer = window.setTimeout(() => setAccent(true), MAIN_MENU_DOWN_HINT.idleDelay);
    events.forEach((event) => window.addEventListener(event, stop, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      removeListeners();
    };
  }, []);

  return (
    <div
      className="main-menu-down-hint"
      aria-hidden="true"
      style={
        {
          '--hint-float-distance': `${MAIN_MENU_DOWN_HINT.floatDistance}px`,
          '--hint-pulse-duration': `${MAIN_MENU_DOWN_HINT.pulseDuration}ms`,
          '--hint-pink': MAIN_MENU_DOWN_HINT.accentPink,
          '--hint-cyan': MAIN_MENU_DOWN_HINT.accentCyan,
        } as CSSProperties
      }
    >
      <span className="main-menu-down-hint-label">MORE</span>
      <span className="main-menu-down-hint-float">
        <span
          className="main-menu-down-hint-accent"
          data-idle-accent={accent ? '' : undefined}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setAccent(false);
          }}
        >
          <MenuHintArrows />
        </span>
      </span>
    </div>
  );
}
