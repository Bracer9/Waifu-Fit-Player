import type { CSSProperties } from 'react';
import '../game-entrance.css';

export const GAME_ENTRANCE = {
  fadeOutMs: 420,
  blackHoldMs: 140,
  fadeInMs: 620,
} as const;

/** A full black cut between spaces; the stage powers on only after the reveal. */
export function GameEntrance({
  phase,
  progress,
  onCovered,
  onRevealed,
}: {
  phase: 'cover' | 'hold' | 'reveal';
  progress: number;
  onCovered: () => void;
  onRevealed: () => void;
}) {
  return (
    <div
      className="game-entrance"
      data-phase={phase}
      aria-hidden={phase === 'hold' ? undefined : true}
      style={
        {
          '--entrance-fade-out': `${GAME_ENTRANCE.fadeOutMs}ms`,
          '--entrance-black-hold': `${GAME_ENTRANCE.blackHoldMs}ms`,
          '--entrance-fade-in': `${GAME_ENTRANCE.fadeInMs}ms`,
        } as CSSProperties
      }
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (phase === 'cover') onCovered();
        else if (phase === 'reveal') onRevealed();
      }}
    >
      {phase === 'hold' && (
        <div className="game-entrance-preparation" role="status" aria-label="正在准备舞台">
          <div className="album-tuning-grain" aria-hidden="true" />
          <div className="album-tuning-station">
            <small>WFP / GETTING READY</small>
            <b>
              TUNING IN<span>...</span>
            </b>
            <i
              role="progressbar"
              aria-label="进曲准备进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.max(0, Math.min(1, progress)) * 100)}
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }}
            />
            <span>GETTING THE STAGE READY.</span>
          </div>
        </div>
      )}
    </div>
  );
}
