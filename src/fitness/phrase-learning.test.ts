import { expect, it } from 'vitest';
import { movementCell } from './phrase-learning';
import type { Note } from '../model';

it('distinguishes sustained effort, unresolved lower-body load, and a release followed by deliberate space', () => {
  const hold: Note = {
    id: 'h',
    lane: 'squat',
    kind: 'hold',
    direction: 'down',
    modifier: 'none',
    timeMs: 0,
    endTimeMs: 14000,
  };
  const up: Note = { id: 'u', lane: 'squat', kind: 'tap', direction: 'up', timeMs: 14000 };
  const underLoad = movementCell([hold, up], 4000, 6000, 500);
  expect(underLoad.tapDensity).toBe(0);
  expect(underLoad.rest).toBe(0);
  expect(underLoad.held[1]).toBe(1);
  // The action at this bar's start returns the body before the held-back beat.
  expect(movementCell([hold, up], 14000, 16000, 500).rest).toBe(1);
  expect(movementCell([{ ...up, direction: 'down' }], 16000, 18000, 500).rest).toBe(0);
});
it('retains simultaneous left/right participation instead of treating two hands as one-sided repetition', () => {
  const n: Note = {
    id: 'both',
    lane: 'punch',
    kind: 'hold',
    direction: 'up',
    armAction: 'reach',
    hand: 'both',
    timeMs: 0,
    endTimeMs: 2000,
    modifier: 'none',
  };
  const c = movementCell([n], 0, 2000, 500);
  expect(c.left).toBe(1);
  expect(c.right).toBe(1);
  expect(c.rest).toBe(0);
});
