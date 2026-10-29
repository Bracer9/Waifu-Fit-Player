import { useLayoutEffect, useRef } from 'react';

/** Scroll only overflowing titles, with a readable pause at each end. */
export function ScrollingTitle({ title, paused = false }: { title: string; paused?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const viewport = heading.current!;
    const label = text.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let animation: Animation | undefined;
    let alive = true;
    const refresh = () => {
      if (!alive) return;
      animation?.cancel();
      animation = undefined;
      const distance = label.scrollWidth - viewport.clientWidth;
      if (paused || document.hidden || reduced.matches || distance <= 1) return;
      const hold = 1400;
      const travel = Math.max(1800, (distance / 32) * 1000);
      const duration = 2 * (hold + travel);
      animation = label.animate(
        [
          { offset: 0, transform: 'translateX(0)' },
          { offset: hold / duration, transform: 'translateX(0)' },
          { offset: 0.5, transform: `translateX(${-distance}px)` },
          { offset: 0.5 + hold / duration, transform: `translateX(${-distance}px)` },
          { offset: 1, transform: 'translateX(0)' },
        ],
        { duration, iterations: Infinity, easing: 'linear' },
      );
      animation.id = 'selected-title-scroll';
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(viewport);
    observer.observe(label);
    reduced.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    void document.fonts.ready.then(refresh);
    refresh();
    return () => {
      alive = false;
      animation?.cancel();
      observer.disconnect();
      reduced.removeEventListener('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [title, paused]);
  return (
    <h2 ref={heading} title={title}>
      <span ref={text}>{title}</span>
    </h2>
  );
}
