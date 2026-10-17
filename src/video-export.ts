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
  return ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1'].find(
    (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
  );
}

export type ExportAudio = { name: string; path: string };
type Recording = { blob: Blob; leadMs: number; duration: number };

export async function findExportAudio(videoFileName: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/video-export/setup?video=${encodeURIComponent(videoFileName)}`,
    { signal },
  );
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('导出服务尚未启动，请重新启动项目后重试。');
  }
  const result = (await response.json()) as { audio: ExportAudio | null; error?: string };
  if (!response.ok) throw new Error(result.error || '导出服务不可用。');
  return result.audio;
}

export async function muxRecording(
  recording: Recording,
  audio: File | ExportAudio,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.append('leadMs', String(recording.leadMs));
  form.append('duration', String(recording.duration));
  if (audio instanceof File) form.append('audio', audio);
  else form.append('audioPath', audio.path);
  form.append('video', recording.blob, 'capture.mp4');
  const response = await fetch('/api/video-export/mux', { method: 'POST', body: form, signal });
  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error || 'MP3 音轨合成失败。');
  }
  return response.blob();
}

/** Capture only the existing game picture; original MP3 audio is muxed separately. */
export function recordVideo(
  stream: MediaStream,
  video: HTMLVideoElement,
  mimeType: string,
  bitrate: number,
  signal: AbortSignal,
): Promise<Recording> {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(new MediaStream(stream.getVideoTracks()), {
      mimeType,
      videoBitsPerSecond: bitrate,
    });
    const chunks: Blob[] = [];
    let started = 0;
    let leadMs = 0;
    let duration = 0;
    let frameCallback = 0;
    let failure: Error | undefined;
    let tailTimer: ReturnType<typeof setTimeout> | undefined;
    const clean = () => {
      clearTimeout(tailTimer);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('ended', ended);
      video.removeEventListener('error', error);
      video.removeEventListener('playing', playing);
      video.cancelVideoFrameCallback(frameCallback);
    };
    const stop = () => {
      if (recorder.state !== 'inactive') {
        duration = (performance.now() - started) / 1000;
        recorder.stop();
      }
    };
    const fail = (reason: Error) => {
      failure = reason;
      video.pause();
      stop();
    };
    const abort = () => fail(new DOMException('录制已取消。', 'AbortError'));
    const error = () => fail(new Error('视频或音频播放出错，已停止导出。'));
    const playing = () => {
      // Offset only the brief recorder-to-playback startup, never the BPM/grid anchor.
      leadMs = Math.max(0, performance.now() - started - video.currentTime * 1000);
    };
    const alignToPicture: VideoFrameRequestCallback = (_now, frame) => {
      // `playing` can precede the actual advancing picture/audio clock. Sample
      // once it is moving, using the displayed frame's media and presentation times.
      if (frame.mediaTime < 0.1) {
        frameCallback = video.requestVideoFrameCallback(alignToPicture);
        return;
      }
      leadMs = Math.max(0, frame.expectedDisplayTime - started - frame.mediaTime * 1000);
    };
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
      else resolve({ blob: new Blob(chunks, { type: recorder.mimeType }), leadMs, duration });
    };
    signal.addEventListener('abort', abort, { once: true });
    video.addEventListener('ended', ended, { once: true });
    video.addEventListener('error', error, { once: true });
    video.addEventListener('playing', playing, { once: true });
    recorder.onstart = () => {
      if (signal.aborted) {
        abort();
        return;
      }
      // A silent screen track produces frames even while the song is paused.
      frameCallback = video.requestVideoFrameCallback(alignToPicture);
      void video
        .play()
        .catch((reason: unknown) =>
          fail(reason instanceof Error ? reason : new Error('视频无法开始播放。')),
        );
    };
    try {
      signal.throwIfAborted();
      // The first frame is recorded before the asynchronous `start` event arrives.
      // Include encoder startup in the audio lead-in; using onstart loses that time.
      started = performance.now();
      recorder.start(1000);
    } catch (reason) {
      clean();
      reject(reason);
    }
  });
}
