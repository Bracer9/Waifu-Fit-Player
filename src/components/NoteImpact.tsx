import type { CSSProperties } from 'react';
import { noteColor, type Note } from '../model';

export const IMPACT_MS = 520;

/** A brief, local burst driven by media time, so pause and seeking stay deterministic. */
export function NoteImpact({
  note,
  elapsed,
  release,
}: {
  note: Note;
  elapsed: number;
  release: boolean;
}) {
  const progress = Math.min(1, Math.max(0, elapsed / IMPACT_MS));
  const ease = 1 - (1 - progress) ** 3;
  const fade = (1 - progress) ** 1.35;
  const color = noteColor(note.lane, note.direction);
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
          opacity: fade * (note.direction === 'close' ? 0.55 : 0.95),
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
