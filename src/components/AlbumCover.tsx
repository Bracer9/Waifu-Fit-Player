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

const MOTION = { driftMs: 6000, returnMs: 420, zoom: 1.02 };

/** Motion stays inside the existing picture aperture, never on the card or caption. */
export function AlbumCover({
  src,
  albumId,
  selected,
  playing,
  eager,
}: {
  src?: string;
  albumId: string;
  selected: boolean;
  playing: boolean;
  eager: boolean;
}) {
  const scene = useRef<HTMLSpanElement>(null);
  const movement = useRef<Animation | null>(null);
  const [detail, setDetail] = useState<{ source: string; kind?: AlbumCoverDetail } | null>(null);
  const [moving, setMoving] = useState(false);
  const id = useId().replace(/:/g, '');
  const kind = detail && detail.source === src ? detail.kind : undefined;
  const pending = !!src && detail?.source !== src;
  const driftEnabled = !['all', 'touhou', 'vocaloid'].includes(albumId);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    void albumCoverDetail(albumId, src)
      .then(async (kind) => {
        if (kind) await prepareAlbumEffect(kind);
        if (alive) setDetail({ source: src, kind });
      })
      .catch(() => {
        // Retain the original if a derived layer cannot load.
        if (alive) setDetail({ source: src });
      });
    return () => {
      alive = false;
    };
  }, [albumId, src]);

  useLayoutEffect(() => {
    const node = scene.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      const from = getComputedStyle(node).transform;
      movement.current?.cancel();
      movement.current = null;
      node.style.transform = '';
      setMoving(false);
      if (from !== 'none' && !reduced.matches && !document.hidden) {
        movement.current = node.animate([{ transform: from }, { transform: 'none' }], {
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
        movement.current = node.animate(
          [
            { transform: from === 'none' ? 'scale(1) translate(0, 0)' : from },
            { transform: `scale(${MOTION.zoom}) translate(-4px, 1px)` },
          ],
          {
            duration: MOTION.driftMs,
            easing: 'cubic-bezier(.25,.48,.35,1)',
            iterations: Infinity,
            direction: 'alternate',
          },
        );
        movement.current.id = 'album-cover-drift';
      }
      if (document.hidden) movement.current.pause();
      else movement.current.play();
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    reduced.addEventListener('change', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      reduced.removeEventListener('change', refresh);
      // Hand the sampled pose to the next selection effect before releasing WAAPI.
      node.style.transform = getComputedStyle(node).transform;
      movement.current?.cancel();
      movement.current = null;
    };
  }, [selected, src, driftEnabled]);

  return (
    <span
      className="collection-art"
      data-cover-motion={moving || undefined}
      data-cover-pending={pending || undefined}
    >
      <span className="album-cover-scene" ref={scene}>
        <CoverArt src={src} eager={eager} />
        {kind && (
          <svg
            className={`album-cover-detail ${kind}`}
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
