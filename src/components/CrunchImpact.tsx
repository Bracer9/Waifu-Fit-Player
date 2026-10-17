import type { CSSProperties } from 'react';

const FRAMES = 32;
const COLUMNS = 8;

/** One bounded sprite replaces the normal burst; frames come only from media time. */
export function CrunchImpact({
  progress,
  release,
  sustain,
}: {
  progress: number;
  release: boolean;
  sustain: boolean;
}) {
  const frame = Math.min(FRAMES - 1, Math.floor(progress * FRAMES));
  return (
    <div
      className={`note-impact crunch-impact ${release ? 'release' : 'arrival'}`}
      data-testid="impact-side_crunch"
      data-frame={frame}
      aria-hidden="true"
      style={{ '--crunch-strength': release ? 0.82 : sustain ? 0.9 : 1 } as CSSProperties}
    >
      <span
        className="crunch-burst"
        style={{
          backgroundPosition: `${((frame % COLUMNS) * 100) / (COLUMNS - 1)}% ${(Math.floor(frame / COLUMNS) * 100) / (FRAMES / COLUMNS - 1)}%`,
        }}
      />
      <span className="crunch-still" style={{ opacity: 1 - progress }} />
    </div>
  );
}
