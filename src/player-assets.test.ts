import { expect, it } from 'vitest';
import { blankChart } from './model';
import { playerAssets } from './usePlayerPreparation';

it('does not decode gameplay impact atlases while editing', () => {
  const chart = blankChart();
  chart.notes = [{ id: 'a', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 }];
  expect(playerAssets(chart).images.filter((url) => url.startsWith('/art/impact/'))).toEqual([]);
  expect(playerAssets(chart, true).images.filter((url) => url.startsWith('/art/impact/'))).toEqual([
    '/art/impact/pink.png',
  ]);
});
it('prepares paired-arm purple without loading unused hand palettes', () => {
  const chart = blankChart();
  chart.notes = [
    { id: 'l', lane: 'punch', direction: 'left', kind: 'tap', timeMs: 1000 },
    { id: 'r', lane: 'punch', direction: 'right', kind: 'tap', timeMs: 1000 },
  ];
  expect(playerAssets(chart, true).images.filter((url) => url.startsWith('/art/impact/'))).toEqual([
    '/art/impact/both.png',
  ]);
});
it('keeps the crunch pipeline separate from normal impact textures', () => {
  const chart = blankChart();
  chart.notes = [{ id: 'c', lane: 'side_crunch', direction: 'left', kind: 'tap', timeMs: 1000 }];
  expect(playerAssets(chart, true).images.filter((url) => url.startsWith('/art/impact/'))).toEqual(
    [],
  );
  expect(playerAssets(chart, true).images).toContain('/art/crunch/impact.png');
});
