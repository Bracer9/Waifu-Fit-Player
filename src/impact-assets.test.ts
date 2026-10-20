import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { IMPACT_TINTS } from './note-impact';

it('ships every impact palette within the fixed decoded-memory budget', () => {
  let bytes = 0;
  for (const tint of IMPACT_TINTS) {
    const png = readFileSync(new URL(`../public/art/impact/${tint}.png`, import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    expect(width).toBe(2048);
    expect(height).toBe(1536);
    // Reject an accidental opaque RGB export of the transparent atlas.
    expect(png[25]).toBe(6);
    bytes += width * height * 4;
  }
  expect(bytes).toBeLessThanOrEqual(60 * 1024 * 1024);
});
