import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  cornerQuad,
  easeBetween,
  easeOutBetween,
  liquidSurface,
  LIQUID_TRANSITION,
} from '../liquid-transition';
import { LaneGlyph } from './Glyph';
import type { MenuSoundPlayer } from '../useMenuSounds';

const PRINTS = [
  { lane: 'squat', x: 210, y: 390, size: 230, angle: -12 },
  { lane: 'punch', x: 1610, y: 350, size: 250, angle: 10 },
  { lane: 'step', x: 405, y: 855, size: 210, angle: 12 },
  { lane: 'side_crunch', x: 1510, y: 845, size: 220, angle: -8 },
  { lane: 'calf_raise', x: 970, y: 135, size: 170, angle: 14 },
] as const;

const INTRO_FONTS = [600, 700, 900].map((weight) => `${weight} 16px "Barlow Condensed"`);

/** Only home ↔ albums uses this curtain. The ordinary navigation remains independent. */
export function LiquidMenuTransition({
  phase,
  direction,
  onCovered,
  onRevealed,
  onSound,
  intro = false,
  introLoad,
}: {
  phase: 'cover' | 'hold' | 'reveal';
  direction: 'forward' | 'back';
  onCovered: () => void;
  onRevealed: () => void;
  onSound: MenuSoundPlayer;
  intro?: boolean;
  introLoad?: () => Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const group = useRef<SVGGElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const clip = useRef<SVGPathElement>(null);
  const other = useRef<SVGPolygonElement>(null);
  const returnedCorner = useRef<SVGPolygonElement>(null);
  const bubbles = useRef<SVGGElement>(null);
  const prints = useRef<SVGGElement>(null);
  const highlight = useRef<SVGPathElement>(null);
  const briefing = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const clipId = useId();
  const callbacks = useRef({ onCovered, onRevealed, onSound });
  callbacks.current = { onCovered, onRevealed, onSound };
  const corners = useRef<HTMLElement[]>([]);
  const foreground = useRef(
    new Map<HTMLElement, { opacity: string; zIndex: string; translate: string }>(),
  );
  const reverse = direction === 'back';
  const [introTypeReady, setIntroTypeReady] = useState(
    () => !intro || INTRO_FONTS.every((font) => document.fonts.check(font)),
  );
  const [introLoadProgress, setIntroLoadProgress] = useState(intro ? 0 : 1);
  const loadProgress = useRef(introLoadProgress);
  loadProgress.current = introLoadProgress;
  const [introHoldComplete, setIntroHoldComplete] = useState(false);

  useEffect(() => {
    if (!intro) return;
    let alive = true;
    let done = 0;
    const tasks = [
      ...INTRO_FONTS.map((font) => document.fonts.load(font)),
      Promise.resolve().then(() => introLoad?.()),
    ];
    // The library hook reports storage errors itself. A failed job must settle
    // the opening too, so its existing notification remains accessible on home.
    tasks.forEach((task) => {
      void task
        .catch(() => {})
        .then(() => {
          if (alive) setIntroLoadProgress(++done / tasks.length);
        });
    });
    // Keep the title's original no-font-swap guarantee.
    void Promise.allSettled(tasks.slice(0, INTRO_FONTS.length)).then(() => {
      if (alive) setIntroTypeReady(true);
    });
    return () => {
      alive = false;
    };
  }, [intro, introLoad]);

  useLayoutEffect(() => {
    if (intro && phase === 'hold' && introHoldComplete)
      briefing.current?.style.setProperty('--liquid-meter', String(introLoadProgress));
  }, [intro, phase, introHoldComplete, introLoadProgress]);

  useEffect(() => {
    if (!intro || phase !== 'hold' || !introHoldComplete || introLoadProgress < 1) return;
    // Let the final cell finish filling before the wave reveals the home menu.
    const timer = setTimeout(() => callbacks.current.onCovered(), 160);
    return () => clearTimeout(timer);
  }, [intro, phase, introHoldComplete, introLoadProgress]);

  useEffect(() => {
    // The opening is visual only; do not attempt sound before a user gesture.
    if (intro) return;
    const stop = callbacks.current.onSound('liquid');
    return () => {
      if (typeof stop === 'function') stop();
    };
  }, [intro]);

  useLayoutEffect(() => {
    corners.current = ['pink', 'cyan'].map((color) =>
      document.querySelector<HTMLElement>(`.menu-app > .ambient-shape.${color}`)!,
    );
    const visibility = corners.current.map((node) => node.style.visibility);
    corners.current.forEach((node) => {
      node.style.visibility = 'hidden';
    });
    return () => {
      corners.current.forEach((node, i) => {
        node.style.visibility = visibility[i];
      });
      foreground.current.forEach((style, node) => {
        node.style.opacity = style.opacity;
        node.style.zIndex = style.zIndex;
        node.style.translate = style.translate;
      });
      foreground.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    let alive = true;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let arrival: Animation | undefined;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const draw = (progress: number) => {
      const width = innerWidth,
        height = innerHeight;
      const normalize = (point: { x: number; y: number }) =>
        reverse ? { x: width - point.x, y: height - point.y } : point;
      // Read live corners again during retreat, so the final frame matches the BGM position.
      const primary = cornerQuad(corners.current[reverse ? 1 : 0]).map(normalize);
      const opposite = cornerQuad(corners.current[reverse ? 0 : 1]).map(normalize);
      const result = liquidSurface(
        primary,
        width,
        height,
        phase === 'cover' ? 'cover' : 'reveal',
        progress,
      );
      const returning = easeOutBetween(LIQUID_TRANSITION.cornerReturnStart, 1, progress);
      // Both original shapes stay completely outside the viewport until the wave has left.
      // The live BGM quad is read every frame, including throughout this separate return.
      const clearance = height * LIQUID_TRANSITION.cornerClearance;
      const primaryShift = -(Math.max(0, ...primary.map((p) => p.y)) + clearance) * (1 - returning);
      const oppositeShift =
        (Math.max(0, height - Math.min(...opposite.map((p) => p.y))) + clearance) * (1 - returning);
      const displacement = easeBetween(0.25, 0.9, progress);
      svg.current!.setAttribute('viewBox', `0 0 ${width} ${height}`);
      group.current!.setAttribute(
        'transform',
        reverse ? `matrix(-1 0 0 -1 ${width} ${height})` : '',
      );
      fill.current!.setAttribute('d', result.path);
      clip.current!.setAttribute('d', result.path);
      highlight.current!.setAttribute('d', result.edge);
      highlight.current!.setAttribute(
        'opacity',
        String(result.activity * LIQUID_TRANSITION.highlightOpacity),
      );
      const printed =
        phase === 'cover'
          ? easeBetween(0.08, 0.45, progress)
          : 1 - easeBetween(0.05, 0.8, progress);
      const drift = (phase === 'cover' ? progress : 1 - progress) * height * 0.024;
      prints.current!.setAttribute('opacity', String(printed * LIQUID_TRANSITION.printOpacity));
      // Cancel the cyan curtain's half turn so its exercise figures stay upright.
      prints.current!.setAttribute(
        'transform',
        reverse ? `matrix(-1 0 0 -1 ${width} ${height - drift})` : `translate(0 ${drift})`,
      );
      other.current!.setAttribute(
        'points',
        opposite
          .map((p) =>
            phase === 'cover'
              ? `${p.x - width * 0.18 * displacement},${p.y + height * 0.65 * displacement}`
              : `${p.x},${p.y + oppositeShift}`,
          )
          .join(' '),
      );
      returnedCorner.current!.setAttribute(
        'points',
        phase === 'reveal' ? primary.map((p) => `${p.x},${p.y + primaryShift}`).join(' ') : '',
      );
      bubbles.current!.setAttribute('opacity', String(result.activity * 0.38));
      bubbles.current!.querySelectorAll('circle').forEach((circle, i) => {
        circle.setAttribute('cx', String(width * [0.17, 0.36, 0.61, 0.81][i]));
        circle.setAttribute(
          'cy',
          String(height * (0.08 + i * 0.13) + (reverse ? 1 : -1) * progress * height * 0.18),
        );
      });
      const message =
        phase === 'cover'
          ? easeBetween(0.74, 0.96, progress)
          : 1 - easeBetween(0.04, 0.25, progress);
      briefing.current!.style.opacity = String(message);
      briefing.current!.style.translate = `0 ${14 * (1 - message)}px`;
      if (!intro || phase !== 'hold')
        briefing.current!.style.setProperty(
          '--liquid-meter',
          String(phase === 'cover' ? easeBetween(0.62, 1, progress) : 1),
        );
      // The gear returns attached to the pink shape; the remaining HUD hints fade normally.
      document
        .querySelectorAll<HTMLElement>('.menu-app .menu-settings, .menu-app .menu-controls')
        .forEach((node) => {
          if (!foreground.current.has(node))
            foreground.current.set(node, {
              opacity: node.style.opacity,
              zIndex: node.style.zIndex,
              translate: node.style.translate,
            });
          node.style.zIndex = '1001';
          if (phase === 'reveal' && node.classList.contains('menu-settings')) {
            node.style.translate = `0 ${reverse ? -oppositeShift : primaryShift}px`;
            node.style.opacity = '1';
          } else
            node.style.opacity = String(
              phase === 'cover'
                ? 1 - easeBetween(0, 0.22, progress)
                : easeBetween(0.72, 1, progress),
            );
        });
      root.current!.dataset.progress = progress.toFixed(3);
    };
    const duration =
      phase === 'hold'
        ? LIQUID_TRANSITION.introHoldMs
        : phase === 'cover'
          ? LIQUID_TRANSITION.coverMs
          : LIQUID_TRANSITION.revealMs;
    draw(0);
    if (!introTypeReady) return;
    // A finite, inspectable timeline drives the SVG; no React renders or background loop.
    const animation = root.current!.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: reduced.matches ? 0 : duration,
      fill: 'both',
    });
    animation.id = `menu-liquid-${phase}`;
    const tick = () => {
      if (!alive) return;
      const progress = Math.min(1, Number(animation.currentTime ?? 0) / duration);
      if (phase !== 'hold') draw(progress);
      else if (intro)
        briefing.current!.style.setProperty(
          '--liquid-meter',
          String(Math.min(loadProgress.current, progress)),
        );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    void animation.finished
      .then(() => {
        if (!alive) return;
        cancelAnimationFrame(frame);
        if (phase === 'hold') {
          if (intro) setIntroHoldComplete(true);
          else callbacks.current.onCovered();
        } else if (phase === 'cover') {
          draw(1);
          if (!reduced.matches) {
            arrival = stamp.current!.animate(
              [{ scale: '0.98' }, { scale: '1.035', offset: 0.42 }, { scale: '1' }],
              {
                duration: LIQUID_TRANSITION.arrivalPulseMs,
                easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
              },
            );
            arrival.id = 'liquid-arrival-pulse';
          }
          timer = setTimeout(
            () => {
              if (alive) callbacks.current.onCovered();
            },
            reduced.matches ? 0 : LIQUID_TRANSITION.coveredMs,
          );
        } else {
          draw(1);
          callbacks.current.onRevealed();
        }
      })
      .catch(() => {});
    const finish = () => animation.finish();
    window.addEventListener('resize', finish);
    reduced.addEventListener('change', finish);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      animation.cancel();
      arrival?.cancel();
      window.removeEventListener('resize', finish);
      reduced.removeEventListener('change', finish);
    };
  }, [phase, reverse, introTypeReady, intro]);

  return (
    <div
      ref={root}
      className="menu-curtain liquid-menu-curtain"
      data-direction={direction}
      data-phase={phase}
      data-liquid={reverse ? 'cyan' : 'pink'}
      data-intro={intro || undefined}
      data-type-ready={introTypeReady || undefined}
      aria-hidden="true"
    >
      <svg ref={svg} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <clipPath id={clipId}>
            <path ref={clip} />
          </clipPath>
        </defs>
        <g ref={group}>
          <polygon ref={other} fill={reverse ? 'var(--pink)' : 'var(--cyan)'} />
          <path ref={fill} className="liquid-fill" fill={reverse ? 'var(--cyan)' : 'var(--pink)'} />
          <polygon
            ref={returnedCorner}
            className="liquid-corner-primary"
            fill={reverse ? 'var(--cyan)' : 'var(--pink)'}
          />
          <g clipPath={`url(#${clipId})`}>
            <g ref={prints} className="liquid-prints" opacity="0">
              <svg width="100%" height="100%" viewBox="0 0 1920 1080">
                {PRINTS.map(({ lane, x, y, size, angle }, i) => (
                  <g
                    key={lane}
                    data-move={lane}
                    transform={`translate(${x} ${y}) rotate(${angle})`}
                  >
                    {i % 2 === 0 ? (
                      <rect
                        x={-size / 2 - 26}
                        y={-size / 2 - 26}
                        width={size + 52}
                        height={size + 52}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                    ) : (
                      <circle r={size * 0.7} fill="none" stroke="currentColor" strokeWidth="3" />
                    )}
                    <svg x={-size / 2} y={-size / 2} width={size} height={size}>
                      <LaneGlyph lane={lane} />
                    </svg>
                  </g>
                ))}
                <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="square">
                  <path d="M580 220h38m-19-19v38 M1285 925h38m-19-19v38 M125 710l24-24 24 24-24 24z" />
                  <path d="M1390 145l30-30m-10 30 30-30m-10 30 30-30 M730 955l30-30m-10 30 30-30" />
                  {[0, 1, 2].map((row) =>
                    [0, 1, 2, 3].map((col) => (
                      <circle
                        key={`${row}-${col}`}
                        cx={1690 + col * 17}
                        cy={600 + row * 17}
                        r="2"
                        fill="currentColor"
                        stroke="none"
                      />
                    )),
                  )}
                </g>
              </svg>
            </g>
            <g ref={bubbles} fill="none" stroke="white" strokeWidth="2">
              {[9, 5, 13, 7].map((r, i) => (
                <circle key={i} r={r} />
              ))}
            </g>
          </g>
          <path
            ref={highlight}
            className="liquid-surface-highlight"
            pathLength="100"
            transform="translate(0 -9)"
          />
        </g>
      </svg>
      <div ref={briefing} className="liquid-briefing">
        <div ref={stamp} className="liquid-briefing-stamp">
          <span className="liquid-briefing-eyebrow">
            {intro
              ? 'WELCOME / LET’S MOVE'
              : reverse
                ? 'WELCOME BACK'
                : 'NEXT UP / MUSIC COLLECTION'}
          </span>
          <h2>
            {(intro
              ? ['WAIFU FIT', 'PLAYER']
              : reverse
                ? ['YOUR MUSIC.', 'YOUR MOVEMENT.']
                : ['SELECT YOUR', 'MUSIC']
            ).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
          <div className="liquid-beat-bar">
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} style={{ '--cell': i } as React.CSSProperties} />
            ))}
          </div>
          <span className="liquid-briefing-signature">
            {intro ? 'LOADING // LET’S MOVE' : "WAIFU FIT PLAYER // LET'S MOVE"}
          </span>
        </div>
      </div>
    </div>
  );
}
