import { expect, it, vi } from 'vitest';
import {
  AFTER_SHOW_SNAP,
  afterShowSnapLayout,
  afterShowTrackNumber,
  captureAfterShowFrame,
} from './after-show-snap';
import { blankChart } from './model';
import type { Song } from './library';

it.each([
  [1280, 720, 16 / 9],
  [1280, 720, 9 / 16],
  [1280, 720, 4],
  [600, 338, 1],
  [320, 180, 9 / 16],
])(
  'keeps %ipx × %ipx wall photos inside the wall without cropping aspect %f',
  (width, height, aspect) => {
    const layout = afterShowSnapLayout(width, height, aspect);
    expect(layout.imageWidth / layout.imageHeight).toBeCloseTo(aspect, 8);
    expect(layout.scale).toBeGreaterThan(0);
    expect(layout.scale).toBeLessThanOrEqual(AFTER_SHOW_SNAP.maxScale);
    const angle = (Math.abs(AFTER_SHOW_SNAP.angleDeg) * Math.PI) / 180;
    const overshoot = layout.scale * 1.018;
    expect(
      (layout.paperWidth * Math.cos(angle) + layout.paperHeight * Math.sin(angle)) * overshoot,
    ).toBeLessThan(width);
    expect(
      (layout.paperHeight * Math.cos(angle) + layout.paperWidth * Math.sin(angle)) * overshoot,
    ).toBeLessThan(height);
    // First animation frame places the captured image exactly on the original contained video.
    const imageCenterY =
      -(layout.header - layout.border) / 2 -
      layout.paperHeight / 2 +
      layout.header +
      layout.imageHeight / 2;
    expect(imageCenterY).toBeCloseTo(0, 8);
  },
);

it('uses the actual album carousel position and leaves unpublished work unnumbered', () => {
  const song = (id: string, albumId: string, updatedAt: number): Song => ({
    id,
    drafts: {},
    released: { dance: { chart: blankChart(id), albumId, updatedAt, cover: '' } },
  });
  const songs = [song('old', 'pop', 10), song('new', 'pop', 30), song('other', 'anime', 20)];
  expect(afterShowTrackNumber(songs, 'pop', 'new')).toBe(1);
  expect(afterShowTrackNumber(songs, 'pop', 'old')).toBe(2);
  expect(afterShowTrackNumber(songs, 'all', 'old')).toBe(3);
  expect(afterShowTrackNumber(songs, 'pop', 'other')).toBeUndefined();
  expect(afterShowTrackNumber(songs, 'all', 'draft')).toBeUndefined();
});

it('copies one valid frame, caps 4K memory, preserves portrait aspect and safely rejects unavailable frames', () => {
  const drawImage = vi.fn();
  const getContext = vi.fn(() => ({ drawImage }));
  const canvas = { width: 0, height: 0, getContext } as unknown as HTMLCanvasElement;
  const video = {
    seeking: false,
    readyState: 4,
    videoWidth: 3840,
    videoHeight: 2160,
  } as HTMLVideoElement;
  expect(captureAfterShowFrame(video, canvas)).toBe(true);
  expect(drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 1920, 1080);
  drawImage.mockClear();
  Object.assign(video, { videoWidth: 1080, videoHeight: 1920 });
  expect(captureAfterShowFrame(video, canvas)).toBe(true);
  expect([canvas.width, canvas.height]).toEqual([1080, 1920]);
  drawImage.mockClear();
  Object.assign(video, { seeking: true });
  expect(captureAfterShowFrame(video, canvas)).toBe(false);
  Object.assign(video, { seeking: false, readyState: 1 });
  expect(captureAfterShowFrame(video, canvas)).toBe(false);
  expect(drawImage).not.toHaveBeenCalled();
  Object.assign(video, { readyState: 4 });
  getContext.mockImplementationOnce(() => {
    throw new Error('unavailable');
  });
  expect(captureAfterShowFrame(video, canvas)).toBe(false);
});
