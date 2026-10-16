import { memo, useSyncExternalStore } from 'react';
import type { Chart } from '../model';
import type { SpecialVisual } from '../special';

type IconName = NonNullable<Chart['specialMove']>['icon'];
const textures = new Map<string, HTMLImageElement>();
/** Load the small baked textures when entering the player, before the first cue. */
export function preloadSpecialTextures() {
  if (textures.size) return;
  const names = [
    'heart',
    'star',
    'sparkles',
    'star-white',
    'star-cyan',
    'burst-heart',
    'burst-star',
    'burst-sparkles',
  ];
  names.forEach((name) => {
    const image = new Image();
    image.src = `/art/special/${name}.png`;
    // Downloading alone can defer PNG decoding until the first burst's critical frame.
    void image.decode().catch(() => {});
    textures.set(name, image);
  });
}
export const SpecialGlyph = memo(function SpecialGlyph({ icon }: { icon: IconName }) {
  return (
    <svg className={`special-glyph lucide-${icon}`} viewBox="0 0 24 24" aria-hidden="true">
      <image href={`/art/special/${icon}.png`} x="-12" y="-12" width="48" height="48" />
    </svg>
  );
});

/** All motion comes from media progress; no independent CSS animation or wall-clock timers. */
export function SpecialEffect({
  visual,
  icon,
  width,
}: {
  visual: SpecialVisual;
  icon: IconName;
  width: number;
}) {
  const { event, phase, progress, remaining } = visual;
  return (
    <div className="special-lane-effect" aria-hidden="true" data-event={event.id} data-icon={icon}>
      {phase !== 'burst' && (
        <div
          className={`special-token ${phase}`}
          data-testid={`special-${phase}`}
          style={{
            transform: `translate3d(${progress * 0.88 * width}px, -50%, 0) translateX(-50%)`,
          }}
        >
          {phase === 'flying' && <span className="special-comet" />}
          <div
            className="special-token-face"
            style={{ transform: `rotate(${phase === 'flying' ? -14 * (1 - progress) : 0}deg)` }}
          >
            <SpecialGlyph icon={icon} />
          </div>
          {phase === 'holding' && (
            <svg className="special-hold-ring" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="46"
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset={1 - remaining}
              />
            </svg>
          )}
        </div>
      )}
      {visual.bursts.map(({ kind, progress: p }) => (
        <SpecialBurst key={kind} kind={kind} progress={p} icon={icon} />
      ))}
    </div>
  );
}

const reducedSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeReduced = (listener: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

/** Select a baked frame directly from media progress; missed frames are never queued. */
function SpecialBurst({
  kind,
  progress: p,
  icon,
}: {
  kind: 'arrival' | 'release';
  progress: number;
  icon: IconName;
}) {
  const reduced = useSyncExternalStore(subscribeReduced, reducedSnapshot);
  const frame = Math.min(49, Math.floor(p * 50));
  return (
    <div className={`special-burst ${kind}`} data-testid="special-burst" data-kind={kind}>
      <div
        className="special-wave"
        hidden={reduced}
        style={{
          opacity: (1 - p) ** 1.5 * 0.55,
          transform: `translate(-100%, -50%) scaleX(${0.3 + (1 - (1 - p) ** 3) * 0.7})`,
        }}
      />
      {reduced ? (
        <div className="special-reduced-echo" style={{ opacity: (1 - p) ** 1.5 }}>
          <SpecialGlyph icon={icon} />
        </div>
      ) : (
        <div
          className="special-burst-sprite"
          data-frame={frame}
          style={{
            backgroundImage: `url(/art/special/burst-${icon}.png)`,
            backgroundPosition: `${((frame % 10) / 9) * 100}% ${(Math.floor(frame / 10) / 4) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
