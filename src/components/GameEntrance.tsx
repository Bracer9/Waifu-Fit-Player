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
  onCovered,
  onRevealed,
}: {
  phase: 'cover' | 'hold' | 'reveal';
  onCovered: () => void;
  onRevealed: () => void;
}) {
  return (
    <div
      className="game-entrance"
      data-phase={phase}
      aria-hidden="true"
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
    />
  );
}
