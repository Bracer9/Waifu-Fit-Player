import { useLayoutEffect, useRef } from 'react';
import { albumHousingOutline } from '../album-deck-motion';
import { fitMenuViewport } from '../menu-viewport';
import { ALBUM_DECK_TIMING } from './AlbumDeck';

const CLOSED = '0,0 1000,0 1000,1000 0,1000 0,500 0,0';

/** Paint the silhouette itself; its background never relies on a composited CSS mask. */
export function AlbumHousing({ open }: { open: boolean }) {
  const surface = useRef<SVGPolygonElement>(null);
  const morph = useRef<SVGAnimateElement>(null);
  const outline = useRef<SVGPolylineElement>(null);
  const previous = useRef<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    const polygon = surface.current!;
    const animation = morph.current!;
    const corner = polygon.closest<HTMLElement>('.ambient-shape.pink')!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = (animate = false) => {
      const { width, height } = fitMenuViewport(innerWidth, innerHeight);
      const shape = albumHousingOutline(width, height);
      const target = open ? shape.points : shape.closedPoints;
      const from = Array.from({ length: polygon.animatedPoints.numberOfItems }, (_, i) => {
        const point = polygon.animatedPoints.getItem(i);
        return `${point.x},${point.y}`;
      }).join(' ');
      polygon.setAttribute('points', target);
      corner.style.setProperty('--album-corner-clip', shape.closedClip);
      corner.style.setProperty('--album-deck-clip', shape.clip);
      outline.current!.setAttribute('points', shape.outline);
      if (animate && !reduced.matches) {
        animation.setAttribute('from', from);
        animation.setAttribute('to', target);
        animation.beginElement();
      } else if (previous.current !== undefined) animation.endElement();
    };
    update(previous.current !== undefined && previous.current !== open);
    previous.current = open;
    const settle = () => update();
    window.addEventListener('resize', settle);
    reduced.addEventListener('change', settle);
    return () => {
      window.removeEventListener('resize', settle);
      reduced.removeEventListener('change', settle);
    };
  }, [open]);
  return (
    <>
      <svg
        className="album-housing-surface"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon ref={surface} points={CLOSED}>
          <animate
            ref={morph}
            attributeName="points"
            begin="indefinite"
            dur={`${ALBUM_DECK_TIMING.unfold}ms`}
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.22 0.75 0.2 1"
          />
        </polygon>
      </svg>
      <div className="album-housing-details" aria-hidden="true">
        <svg className="album-housing-outline" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <polyline ref={outline} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </>
  );
}
