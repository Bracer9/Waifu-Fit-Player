import { expect, it } from 'vitest';
import { impactTint } from './note-impact';
import type { DisplayNote } from './armDisplay';

it('uses the real action/hand palette, including calf mint and paired arms', () => {
  const tap: DisplayNote = { id: 'a', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 0 };
  expect(impactTint(tap)).toBe('pink');
  expect(impactTint({ ...tap, lane: 'calf_raise', direction: 'up' })).toBe('miku');
  expect(impactTint({ ...tap, lane: 'step', direction: 'left' })).toBe('cyan');
  expect(impactTint({ ...tap, lane: 'step', direction: 'left', foot: 'right' })).toBe('pink');
  expect(impactTint({ ...tap, lane: 'punch', direction: 'up', hand: 'any' })).toBe('neutral');
  expect(impactTint({ ...tap, lane: 'punch', direction: 'left', pairedPunch: true })).toBe('both');
});
