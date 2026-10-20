import type { CSSProperties } from 'react';
import { noteColor } from '../model';
import type { DisplayNote } from '../armDisplay';
import { CrunchImpact } from './CrunchImpact';
import { impactTint, IMPACT_FRAMES } from '../note-impact';

export const IMPACT_MS = 520;

/** A brief, local burst driven by media time, so pause and seeking stay deterministic. */
export function NoteImpact({
  note,
  elapsed,
  release,
  baked = false,
}: {
  note: DisplayNote;
  elapsed: number;
  release: boolean;
  baked?: boolean;
}) {
  const progress = Math.min(1, Math.max(0, elapsed / IMPACT_MS));
  if (note.lane === 'side_crunch')
    return <CrunchImpact progress={progress} release={release} sustain={note.kind === 'hold'} />;
  const ease = 1 - (1 - progress) ** 3;
  const fade = (1 - progress) ** 1.35;
  const color = note.pairedPunch
    ? 'var(--arms-both)'
    : noteColor(note.lane, note.direction, note.hand, note.armAction, note.foot);
  if (baked) {
    const frame =
      Math.min(IMPACT_FRAMES - 1, Math.floor(progress * IMPACT_FRAMES)) +
      (release ? IMPACT_FRAMES : 0);
    return (
      <div
        className={`note-impact baked-impact ${release ? 'release' : 'arrival'}`}
        aria-hidden="true"
        data-testid={`impact-${note.lane}`}
        data-frame={frame}
        style={{ '--lane': color } as CSSProperties}
      >
        <span
          className="impact-sprite"
          style={{
            backgroundImage: `url(/art/impact/${impactTint(note)}.png)`,
            backgroundPosition: `${((frame % 8) / 7) * 100}% ${(Math.floor(frame / 8) / 7) * 100}%`,
            opacity: note.direction === 'free' ? 0.8 : 1,
          }}
        />
        <span className="impact-still" style={{ opacity: 1 - progress }} />
      </div>
    );
  }
  return (
    <div
      className={`note-impact ${release ? 'release' : 'arrival'}`}
      aria-hidden="true"
      data-testid={`impact-${note.lane}`}
      style={{ '--lane': color } as CSSProperties}
    >
      <div
        className="impact-halo"
        style={{
          opacity: fade * (note.direction === 'free' ? 0.55 : 0.95),
          transform: `translate(-50%, -50%) scale(${0.6 + ease * 0.9})`,
        }}
      />
      <div
        className="impact-ring"
        style={{
          opacity: 1 - progress,
          transform: `translate(-50%, -50%) scale(${0.65 + ease * (release ? 1.1 : 0.9)})`,
        }}
      />
      <div
        className="impact-core"
        style={{
          opacity: Math.max(0, 1 - progress * 2.4),
          transform: `translate(-50%, -50%) scale(${1.15 - ease * 0.55})`,
        }}
      >
        <span className={release ? 'release-core' : 'impact-light'} />
      </div>
      <div
        className="impact-flare"
        style={{
          opacity: Math.max(0, 1 - progress * 2.8),
          transform: `translate(-50%, -50%) scale(${0.6 + ease * 0.8})`,
        }}
      />
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i * Math.PI) / 4 + Math.PI / 8;
        const distance = 20 + ease * (i % 2 ? 48 : 62);
        return (
          <i
            className={`impact-particle ${i % 2 ? 'spark' : 'streak'}`}
            key={i}
            style={{
              opacity: fade,
              transform: `translate(-50%, -50%) translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance * 0.6}px) rotate(${(angle * 180) / Math.PI}deg) scale(${1 - progress * 0.45})`,
            }}
          />
        );
      })}
    </div>
  );
}
