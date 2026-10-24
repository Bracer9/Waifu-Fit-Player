import { describe, expect, it } from 'vitest';
import { fitMenuViewport, pointInMenu } from './menu-viewport';

describe('menu composition fitting', () => {
  it('preserves existing desktop layouts and leaves the workbench unscaled', () => {
    for (const [width, height] of [
      [1920, 1080],
      [2560, 1440],
    ])
      expect(fitMenuViewport(width, height)).toEqual({
        width,
        height,
        scale: 1,
        x: 0,
        y: 0,
        scaled: false,
      });
    expect(fitMenuViewport(1440, 900, false)).toEqual({
      width: 1440,
      height: 900,
      scale: 1,
      x: 0,
      y: 0,
      scaled: false,
    });
  });

  it('fills taller laptop windows without stretching the design pixel scale and maps input back', () => {
    expect(fitMenuViewport(1440, 900)).toEqual({
      width: 1920,
      height: 1200,
      scale: 0.75,
      x: 0,
      y: 0,
      scaled: true,
    });
    for (const [width, height] of [
      [1470, 956],
      [1710, 1107],
      [1440, 800],
      [2560, 900],
    ]) {
      const view = fitMenuViewport(width, height);
      expect(view.width * view.scale + view.x * 2).toBeCloseTo(width);
      expect(view.height * view.scale + view.y * 2).toBeCloseTo(height);
      for (const point of [
        { x: 0, y: 0 },
        { x: 960, y: 540 },
        { x: 1920, y: 1080 },
      ]) {
        const mapped = pointInMenu(
          { x: view.x + point.x * view.scale, y: view.y + point.y * view.scale },
          view,
        );
        expect(mapped.x).toBeCloseTo(point.x);
        expect(mapped.y).toBeCloseTo(point.y);
      }
    }
  });
});
