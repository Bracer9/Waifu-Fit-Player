import type { CSSProperties } from 'react';
import { noteColor, type Note } from '../model';
import { NoteGlyph } from './Glyph';

export const IMPACT_MS = 340;

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
  const fade = (1 - progress) ** 2;
  const color =
    note.lane !== 'step' && note.kind === 'hold' && note.modifier === 'sway'
      ? '#c78cfa'
      : noteColor(note.lane, note.direction);
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
          opacity: fade * 0.65,
          transform: `translate(-50%, -50%) scale(${0.7 + ease * 0.4})`,
        }}
      />
      <div
        className="impact-ring"
        style={{
          opacity: 1 - progress,
          transform: `translate(-50%, -50%) scale(${0.72 + ease * 0.48})`,
        }}
      />
      <div
        className="impact-core"
        style={{
          opacity: fade * (release ? 0.45 : 0.8),
          transform: `translate(-50%, -50%) scale(${1 - ease * 0.2})`,
        }}
      >
        <NoteGlyph lane={note.lane} direction={note.direction} distance={note.distance} />
      </div>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([x, y], i) => (
        <i
          className="impact-particle"
          key={i}
          style={{
            opacity: fade * 0.85,
            transform: `translate(-50%, -50%) translate(${x * (24 + ease * 29)}px, ${y * (12 + ease * 15)}px) rotate(${x * y * 28}deg) scale(${1 - progress * 0.5})`,
          }}
        />
      ))}
    </div>
  );
}
