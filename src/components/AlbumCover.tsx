import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CoverArt } from './CoverArt';
import { albumCoverDetail, type AlbumCoverDetail } from '../album-cover-detail';
import {
  AlbumCoverEffects,
  albumEffectViewBox,
  persistentAlbumEffect,
  prepareAlbumEffect,
} from './AlbumCoverEffects';
import '../album-cover.css';
import type { Album } from '../library';

const MOTION = { driftMs: 6000, focusCycleMs: 3000, returnMs: 420, zoom: 1.02 };
const DRIFT_EASING = 'cubic-bezier(.25,.48,.35,1)';
const FOCUS_EASING = 'cubic-bezier(.45,0,.55,1)';
// Brief sharp rest, then a slow focus drift in each direction without a peak hold.
const FOCUS_STOPS = [
  [0, 0],
  [1 / 12, 0],
  [0.5, 1],
  [11 / 12, 0],
  [1, 0],
] as const;

/** Motion stays inside the existing picture aperture, never on the card or caption. */
export function AlbumCover({
  src,
  albumId,
  coverEffect,
  selected,
  playing,
  eager,
}: {
  src?: string;
  albumId: string;
  coverEffect?: Album['coverEffect'];
  selected: boolean;
  playing: boolean;
  eager: boolean;
}) {
  const scene = useRef<HTMLSpanElement>(null);
  const movement = useRef<Animation | null>(null);
  const defocus = useRef<HTMLSpanElement>(null);
  const focusing = useRef<Animation | null>(null);
  const glinting = useRef<Animation | null>(null);
  const [detail, setDetail] = useState<{
    source: string;
    effect?: Album['coverEffect'];
    kind?: AlbumCoverDetail;
  } | null>(null);
  const [moving, setMoving] = useState(false);
  const id = useId().replace(/:/g, '');
  const kind =
    detail && detail.source === src && detail.effect === coverEffect ? detail.kind : undefined;
  const pending = !!src && detail?.source !== src;
  const driftEnabled = !['all', 'vocaloid', 'anime'].includes(albumId);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    void albumCoverDetail(albumId, src, coverEffect)
      .then(async (kind) => {
        if (kind) await prepareAlbumEffect(kind);
        if (alive) setDetail({ source: src, effect: coverEffect, kind });
      })
      .catch(() => {
        // Retain the original if a derived layer cannot load.
        if (alive) setDetail({ source: src, effect: coverEffect });
      });
    return () => {
      alive = false;
    };
  }, [albumId, src, coverEffect]);

  useLayoutEffect(() => {
    const node = scene.current!;
    const focusNode = defocus.current;
    const glintNode = node.querySelector<SVGGElement>('.album-earring-glint');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      const from = getComputedStyle(node).transform;
      const focusFrom = focusNode ? getComputedStyle(focusNode).opacity : '0';
      movement.current?.cancel();
      movement.current = null;
      focusing.current?.cancel();
      focusing.current = null;
      glinting.current?.cancel();
      glinting.current = null;
      node.style.transform = '';
      if (focusNode) focusNode.style.opacity = '';
      setMoving(false);
      if (from !== 'none' && !reduced.matches && !document.hidden) {
        movement.current = node.animate([{ transform: from }, { transform: 'none' }], {
          duration: MOTION.returnMs,
          easing: 'cubic-bezier(.2,.7,.2,1)',
        });
      }
      if (focusNode && Number(focusFrom) > 0 && !reduced.matches && !document.hidden) {
        focusing.current = focusNode.animate([{ opacity: focusFrom }, { opacity: 0 }], {
          duration: MOTION.returnMs,
          easing: 'cubic-bezier(.2,.7,.2,1)',
        });
      }
    };
    const refresh = () => {
      if (!selected || reduced.matches) {
        stop();
        return;
      }
      setMoving(!document.hidden);
      if (!driftEnabled) {
        movement.current?.cancel();
        movement.current = null;
        node.style.transform = '';
        return;
      }
      if (!movement.current || movement.current.playState === 'finished') {
        const from = getComputedStyle(node).transform;
        movement.current?.cancel();
        node.style.transform = '';
        focusing.current?.cancel();
        focusing.current = null;
        glinting.current?.cancel();
        glinting.current = null;
        if (focusNode) focusNode.style.opacity = '';
        const timing: KeyframeAnimationOptions = {
          duration: focusNode ? MOTION.focusCycleMs : MOTION.driftMs,
          easing: focusNode ? 'linear' : DRIFT_EASING,
          iterations: Infinity,
          direction: focusNode ? 'normal' : 'alternate',
        };
        const near = `scale(${MOTION.zoom}) translate(-4px, 1px)`;
        movement.current = node.animate(
          focusNode
            ? FOCUS_STOPS.map(([offset, depth]) => ({
                offset,
                transform: depth ? near : 'none',
                easing: FOCUS_EASING,
              }))
            : [
                { transform: from === 'none' ? 'scale(1) translate(0, 0)' : from },
                { transform: near },
              ],
          timing,
        );
        movement.current.id = 'album-cover-drift';
        if (focusNode) {
          focusing.current = focusNode.animate(
            FOCUS_STOPS.map(([offset, depth]) => ({
              offset,
              opacity: depth * 0.9,
              easing: FOCUS_EASING,
            })),
            timing,
          );
          focusing.current.id = 'album-cover-focus';
          if (glintNode) {
            // Preserve the full soft flash, shifting it one clear-rest interval
            // earlier so its peak lands exactly when focus becomes fully sharp.
            glinting.current = glintNode.animate(
              [
                { offset: 0, opacity: 1, transform: 'scale(1.12)' },
                { offset: 1 / 12, opacity: 0, transform: 'scale(.78)' },
                { offset: 11 / 12, opacity: 0, transform: 'scale(.78)' },
                { offset: 1, opacity: 1, transform: 'scale(1.12)' },
              ],
              { ...timing, delay: -MOTION.focusCycleMs / 12 },
            );
            glinting.current.id = 'album-cover-glint';
          }
          const start = document.timeline.currentTime;
          if (start !== null) {
            for (const animation of [movement.current, focusing.current, glinting.current]) {
              if (animation) animation.startTime = start;
            }
          }
        }
      }
      if (document.hidden) {
        movement.current.pause();
        focusing.current?.pause();
        glinting.current?.pause();
      } else {
        movement.current.play();
        focusing.current?.play();
        glinting.current?.play();
      }
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    reduced.addEventListener('change', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      reduced.removeEventListener('change', refresh);
      // Hand the sampled pose to the next selection effect before releasing WAAPI.
      node.style.transform = getComputedStyle(node).transform;
      if (focusNode) focusNode.style.opacity = getComputedStyle(focusNode).opacity;
      movement.current?.cancel();
      movement.current = null;
      focusing.current?.cancel();
      focusing.current = null;
      glinting.current?.cancel();
      glinting.current = null;
    };
  }, [selected, src, driftEnabled, kind]);

  return (
    <span
      className="collection-art"
      data-cover-motion={moving || undefined}
      data-cover-pending={pending || undefined}
    >
      <span className="album-cover-scene" ref={scene}>
        <CoverArt src={src} eager={eager} />
        {albumId === 'pop' && src && (
          <span className="album-cover-defocus" ref={defocus} aria-hidden="true">
            <CoverArt src={src} eager={eager} />
          </span>
        )}
        {kind && (
          <svg
            className={`album-cover-detail ${kind}${kind.endsWith('-oil') ? ` ${kind.slice(0, -4)}` : ''}`}
            viewBox={albumEffectViewBox(kind)}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            data-persistent={persistentAlbumEffect(kind) || undefined}
            data-playing={playing || undefined}
          >
            <AlbumCoverEffects kind={kind} src={src} id={id} />
          </svg>
        )}
      </span>
    </span>
  );
}
