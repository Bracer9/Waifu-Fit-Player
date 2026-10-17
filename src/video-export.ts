export const EXPORT_PRESETS = [
  { label: '720', width: 1280, bitrate: 8_000_000 },
  { label: '1080', width: 1920, bitrate: 16_000_000 },
  { label: '2K', width: 2560, bitrate: 28_000_000 },
] as const;

// Keep the complete composition, including 16:10 displays. H.264 needs even dimensions.
export function exportSize(width: number, aspect: number) {
  return { width, height: Math.round(width / aspect / 2) * 2 };
}

export function mp4RecordingType() {
  return ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2'].find(
    (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
  );
}

/** Record the existing player; no second playback clock, canvas renderer or transcoding. */
export function recordVideo(
  stream: MediaStream,
  video: HTMLVideoElement,
  mimeType: string,
  bitrate: number,
  signal: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: 320_000,
    });
    const chunks: Blob[] = [];
    let failure: Error | undefined;
    let tailTimer: ReturnType<typeof setTimeout> | undefined;
    const clean = () => {
      clearTimeout(tailTimer);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('ended', ended);
      video.removeEventListener('error', error);
    };
    const stop = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
    const fail = (reason: Error) => {
      failure = reason;
      video.pause();
      stop();
    };
    const abort = () => fail(new DOMException('录制已取消。', 'AbortError'));
    const error = () => fail(new Error('视频或音频播放出错，已停止导出。'));
    // Let the capture pipeline receive the final painted frame before closing the file.
    const ended = () => {
      tailTimer = setTimeout(stop, 200);
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => fail(new Error('MP4 编码失败，请尝试较低画质。'));
    recorder.onstop = () => {
      clean();
      if (failure) reject(failure);
      else if (!video.ended) reject(new Error('录制提前停止，未导出不完整的视频。'));
      else if (!chunks.length) reject(new Error('未收到录制数据，请重试。'));
      else resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    signal.addEventListener('abort', abort, { once: true });
    video.addEventListener('ended', ended, { once: true });
    video.addEventListener('error', error, { once: true });
    try {
      signal.throwIfAborted();
      recorder.start(1000);
      // Start playback after arming the recorder. Waiting for its first encoded
      // data can deadlock when the paused source is not producing audio yet.
      void video
        .play()
        .catch((reason: unknown) =>
          fail(reason instanceof Error ? reason : new Error('视频无法开始播放。')),
        );
    } catch (reason) {
      clean();
      reject(reason);
    }
  });
}
