import type { CSSProperties } from 'react';
import { Heart, Sparkles, Star } from 'lucide-react';
import type { Chart } from '../model';
import type { SpecialVisual } from '../special';

type IconName = NonNullable<Chart['specialMove']>['icon'];
export function SpecialGlyph({ icon }: { icon: IconName }) {
  const Icon = icon === 'star' ? Star : icon === 'sparkles' ? Sparkles : Heart;
  return <Icon className="special-glyph" strokeWidth={3.6} />;
}

/** All motion comes from media progress; no independent CSS animation or wall-clock timers. */
export function SpecialEffect({
  visual,
  icon,
  row,
}: {
  visual: SpecialVisual;
  icon: IconName;
  row: number;
}) {
  const { event, phase, progress, remaining } = visual;
  return (
    <div className="special-lane-effect" aria-hidden="true" data-event={event.id} data-icon={icon}>
      {phase !== 'burst' && (
        <div
          className={`special-token ${phase}`}
          data-testid={`special-${phase}`}
          style={{ left: `${progress * 88}%` }}
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
      {visual.bursts.map(({ kind, progress: p }) => {
        const ease = 1 - (1 - p) ** 3;
        const fade = (1 - p) ** 1.5;
        return (
          <div
            className={`special-burst ${kind}`}
            key={kind}
            data-testid="special-burst"
            data-kind={kind}
          >
            <div
              className="special-wave"
              style={{
                opacity: fade * 0.55,
                transform: `translate(-100%, -50%) scaleX(${0.3 + ease * 0.7})`,
              }}
            />
            <div
              className="special-flare"
              style={{
                opacity: fade,
                transform: `translate(-50%, -50%) scale(${0.6 + ease * 1.8}, ${1 - p * 0.5})`,
              }}
            />
            {[0, 1].map((ring) => (
              <div
                key={ring}
                className={`special-shockwave ring-${ring}`}
                style={{
                  opacity: fade * (ring ? 0.65 : 1),
                  transform: `translate(-50%, -50%) scale(${0.7 + ease * (ring ? 1.6 : 1.1)}, ${0.55 + ease * 0.45}) rotate(${ring ? -18 : 18}deg)`,
                }}
              />
            ))}
            <div
              className="special-echo"
              style={{
                opacity: fade,
                transform: `translate(-50%, -50%) scale(${1 + ease * 0.65}) rotate(${(row % 2 ? 1 : -1) * ease * 16}deg)`,
              }}
            >
              <SpecialGlyph icon={icon} />
            </div>
            {Array.from({ length: 14 }, (_, i) => {
              const angle = (i / 14) * Math.PI * 2 + row * 0.17;
              const distance = 0.3 + ease * (i % 2 ? 1.9 : 1.4);
              return (
                <i
                  key={i}
                  className={`special-shard ${i % 3 === 0 ? 'star' : 'streak'}`}
                  style={
                    {
                      '--shard-color': ['#faffff', 'var(--pink)', 'var(--cyan)', '#faffff'][i % 4],
                      opacity: fade,
                      transform: `translate(-50%, -50%) translate(calc(var(--special-size) * ${Math.cos(angle) * distance}), calc(var(--special-size) * ${Math.sin(angle) * (0.12 + ease * 0.4)})) rotate(${(angle * 180) / Math.PI + ease * 90}deg) scale(${1 - p * 0.5})`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
