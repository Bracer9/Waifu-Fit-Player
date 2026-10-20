import { describe, expect, it } from 'vitest';
import { ribbonOutline, waveOffset } from './ribbonGeometry';

const shape = {
  durationMs: 3200,
  fullWidth: 500,
  visibleWidth: 500,
  height: 56,
  bandWidth: 17,
  headGap: 17,
  sway: true,
};
describe('long-note contours', () => {
  it('keeps the existing wave stationary as its visible end moves', () => {
    const full = ribbonOutline(shape).split(' C ');
    const held = ribbonOutline({ ...shape, visibleWidth: 300 }).split(' C ');
    expect(held.slice(0, 35)).toEqual(full.slice(0, 35));
    expect(held).not.toEqual(full);
    expect(ribbonOutline(shape)).toBe(full.join(' C '));
  });
  it('keeps a constant period in media time and joins at the centre', () => {
    expect(waveOffset(3200, 0, 56)).toBe(0);
    expect(waveOffset(3200, 1, 56)).toBeCloseTo(0);
    expect(waveOffset(3200, 0.125, 56)).toBeCloseTo(14.56);
    expect(waveOffset(3200, 0.375, 56)).toBeCloseTo(-14.56);
  });
  it('omits an exhausted body instead of making a backward or invalid shape', () => {
    expect(ribbonOutline({ ...shape, visibleWidth: 10 })).toBe('');
    expect(ribbonOutline({ ...shape, visibleWidth: 40 })).not.toMatch(/NaN|Infinity/);
  });
  it('bounds long holds to the visible window without changing the wave or head taper', () => {
    const long = { ...shape, durationMs: 60000, fullWidth: 10000, visibleWidth: 10000 };
    const full = ribbonOutline(long);
    const cropped = ribbonOutline({ ...long, visibleStart: 9402 });
    const segments = (path: string) => path.split(' C ');
    // Control points at the crop boundary are outside the viewport overscan.
    const interior = segments(cropped).slice(2, -2);
    for (const segment of interior) expect(full).toContain(` C ${segment}`);
    expect(cropped.length).toBeLessThan(full.length / 10);
    expect(cropped).not.toMatch(/NaN|Infinity/);
  });
});
