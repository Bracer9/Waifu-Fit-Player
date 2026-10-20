import type { CSSProperties } from 'react';

export type ReadyCountdownPhase = 'waiting' | 'counting' | 'go';

export const READY_COUNTDOWN = {
  introMs: 600,
  beatMs: 800,
  revealMs: 300,
  coverBlurPx: 12,
  coverShade: 0.38,
  laneStaggerMs: 85,
  laneSweepMs: 1800,
  lineSweepMs: 1200,
  roomShade: 0.38,
  roomFocusBlurPx: 5,
  lightRiseMs: 600,
} as const;

export const readyCountdownStyle = {
  '--ready-intro': `${READY_COUNTDOWN.introMs}ms`,
  '--ready-beat': `${READY_COUNTDOWN.beatMs}ms`,
  '--ready-duration': `${READY_COUNTDOWN.beatMs * 3}ms`,
  '--ready-reveal': `${READY_COUNTDOWN.revealMs}ms`,
  '--ready-cover-blur': `${READY_COUNTDOWN.coverBlurPx}px`,
  '--ready-cover-shade': READY_COUNTDOWN.coverShade,
  '--ready-lane-stagger': `${READY_COUNTDOWN.laneStaggerMs}ms`,
  '--ready-lane-sweep': `${READY_COUNTDOWN.laneSweepMs}ms`,
  '--ready-line-sweep': `${READY_COUNTDOWN.lineSweepMs}ms`,
  '--ready-room-shade': READY_COUNTDOWN.roomShade,
  '--ready-room-focus-blur': `${READY_COUNTDOWN.roomFocusBlurPx}px`,
  '--ready-light-rise': `${READY_COUNTDOWN.lightRiseMs}ms`,
} as CSSProperties;
