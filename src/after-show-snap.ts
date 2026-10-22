import { editionsIn, type Song } from './library';

export const AFTER_SHOW_SNAP = {
  delayMs: 0,
  flashMs: 80,
  revealMs: 520,
  angleDeg: -3,
  maxScale: 0.84,
  captureEdge: 1920,
  frameWaitMs: 2000,
} as const;

/** Album-local carousel position, never an invented number for unpublished work. */
export function afterShowTrackNumber(songs: Song[], albumId: string, songId?: string) {
  const index = songs
    .filter((song) => editionsIn(song, albumId).length)
    .sort(
      (a, b) =>
        (b.released.dance ?? b.released.fitness)!.updatedAt -
        (a.released.dance ?? a.released.fitness)!.updatedAt,
    )
    .findIndex((song) => song.id === songId);
  return index >= 0 ? index + 1 : undefined;
}

/** Untransformed wall coordinates; account for the paper AND its rotated corners. */
export function afterShowSnapLayout(width: number, height: number, aspect: number) {
  const imageWidth = Math.min(width, height * aspect);
  const imageHeight = imageWidth / aspect;
  const border = Math.max(8, Math.min(14, width * 0.012));
  const header = Math.max(30, Math.min(46, height * 0.07));
  const paperWidth = imageWidth + border * 2;
  const paperHeight = imageHeight + header + border;
  const angle = (Math.abs(AFTER_SHOW_SNAP.angleDeg) * Math.PI) / 180;
  const rotatedWidth = paperWidth * Math.cos(angle) + paperHeight * Math.sin(angle);
  const rotatedHeight = paperHeight * Math.cos(angle) + paperWidth * Math.sin(angle);
  const margin = Math.min(24, width * 0.035, height * 0.035);
  const scale = Math.min(
    AFTER_SHOW_SNAP.maxScale,
    (width - margin * 2) / rotatedWidth,
    (height - margin * 2) / rotatedHeight,
  );
  return { imageWidth, imageHeight, paperWidth, paperHeight, border, header, scale };
}

/** One in-memory frame, no encoding, persistence, pixel analysis or extra decoder. */
export function captureAfterShowFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (video.seeking || video.readyState < 2 || !video.videoWidth || !video.videoHeight)
    return false;
  try {
    const ratio = Math.min(
      1,
      AFTER_SHOW_SNAP.captureEdge / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return false;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return true;
  } catch {
    return false;
  }
}
