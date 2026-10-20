import { useSyncExternalStore } from 'react';

export function audioOutputErrorMessage(error: Pick<MediaError, 'message'> | null): string {
  return error && /AUDIO_RENDERER_ERROR\b|audio render error/i.test(error.message)
    ? '音频无法播放：无法使用当前音频输出设备，请检查设备连接及其他程序占用。'
    : '';
}

export type MediaStatus = {
  ready: boolean;
  playing: boolean;
  durationMs: number;
  volume: number;
  error: string;
  preparing: boolean;
};
export type LoopRange = { startMs: number; endMs: number };
export class MediaController {
  element: HTMLVideoElement | null = null;
  private timeMs = 0;
  private status: MediaStatus = {
    ready: false,
    playing: false,
    durationMs: 0,
    volume: 0.7,
    error: '',
    preparing: false,
  };
  private timeListeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();
  private frame = 0;
  private nextFrameAt = 0;
  private cleanup?: () => void;
  private loopRange: LoopRange | null = null;
  private playbackRange: LoopRange | null = null;
  constructor() {
    try {
      const saved = localStorage.getItem('waifu-video-volume');
      const volume = Number(saved);
      if (saved !== null && Number.isFinite(volume) && volume >= 0 && volume <= 1)
        this.status.volume = volume;
    } catch {
      /* Keep the initial video volume when storage is unavailable. */
    }
  }
  subscribeTime = (listener: () => void) => {
    this.timeListeners.add(listener);
    return () => {
      this.timeListeners.delete(listener);
    };
  };
  subscribeStatus = (listener: () => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };
  getTime = () => this.timeMs;
  getStatus = () => this.status;
  setPreparing = (preparing: boolean) => {
    if (this.status.preparing === preparing) return;
    this.status = { ...this.status, preparing };
    this.statusListeners.forEach((fn) => fn());
  };
  private positionInLoop = (timeMs: number) => {
    if (this.playbackRange) return timeMs;
    const range = this.loopRange;
    return range && (timeMs < range.startMs || timeMs >= range.endMs) ? range.startMs : timeMs;
  };
  /** Game-only bounds. Editor looping remains a separate, temporary command. */
  setPlaybackRange = (range: LoopRange | null) => {
    this.playbackRange = range;
    const video = this.element;
    if (range && video && video.readyState >= 1) {
      const time = video.currentTime * 1000;
      if (time < range.startMs || time >= range.endMs) this.seek(range.startMs);
    }
  };
  setLoopRange = (range: LoopRange | null) => {
    const next = range && range.endMs > range.startMs ? range : null;
    if (next?.startMs === this.loopRange?.startMs && next?.endMs === this.loopRange?.endMs) return;
    this.loopRange = next;
    // A changed range is a user command: enter it once, rather than continually
    // correcting the decoded playhead near its lower boundary.
    if (next && this.element && !this.element.paused) {
      const current = this.element.currentTime * 1000;
      const target = this.positionInLoop(current);
      if (target !== current) this.seek(target);
    }
  };
  private readTime = () => {
    const video = this.element;
    const range = this.playbackRange ? null : this.loopRange;
    const playbackEnd = this.playbackRange?.endMs;
    if (
      video &&
      playbackEnd !== undefined &&
      !video.paused &&
      video.currentTime * 1000 >= playbackEnd
    ) {
      video.currentTime = playbackEnd / 1000;
      video.pause();
    }
    // Seek the actual video (and its audio), never rewind a separate chart clock.
    if (video && range && !video.paused && !video.seeking && !video.ended) {
      // Playback only watches the END boundary. A seek may land just before the
      // requested start due to browser precision; seeked/canplay must let it
      // advance instead of reissuing the same seek and starving the decoder.
      if (video.currentTime * 1000 >= range.endMs) video.currentTime = range.startMs / 1000;
    }
    const time = (this.element?.currentTime ?? 0) * 1000;
    if (time !== this.timeMs) {
      this.timeMs = time;
      this.timeListeners.forEach((fn) => fn());
    }
  };
  private onEnded = () => {
    if (this.playbackRange || !this.loopRange || !this.element) return;
    this.seek(this.loopRange.startMs);
    void this.element.play().catch(this.readStatus);
  };
  private readStatus = (event?: Event) => {
    const v = this.element;
    if (!v) return;
    if (event?.type === 'loadedmetadata' && this.playbackRange)
      v.currentTime = this.playbackRange.startMs / 1000;
    const next: MediaStatus = {
      ready: v.readyState >= 1 && !v.error,
      playing: !v.paused && !v.ended,
      durationMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0,
      volume: v.muted ? 0 : v.volume,
      error: v.error
        ? audioOutputErrorMessage(v.error) ||
          '视频无法播放。请尝试 H.264 视频 + AAC 音频的 MP4 文件。'
        : '',
      preparing: this.status.preparing,
    };
    if (JSON.stringify(next) !== JSON.stringify(this.status)) {
      this.status = next;
      this.statusListeners.forEach((fn) => fn());
    }
    this.readTime();
    cancelAnimationFrame(this.frame);
    if (!v.paused && !v.ended) this.frame = requestAnimationFrame(this.tick);
  };
  private tick = (timestamp: number) => {
    // High-refresh displays must not rebuild all SVG tracks 120/144 times per second.
    // Only rendering is capped; every published time is read fresh from the video.
    const frameMs = 1000 / 60;
    if (timestamp + 0.5 >= this.nextFrameAt) {
      this.readTime();
      this.nextFrameAt +=
        (Math.floor(Math.max(0, timestamp - this.nextFrameAt) / frameMs) + 1) * frameMs;
    }
    if (this.element && !this.element.paused) this.frame = requestAnimationFrame(this.tick);
  };
  attach = (video: HTMLVideoElement | null) => {
    this.cleanup?.();
    this.element = video;
    if (!video) return;
    video.volume = this.status.volume;
    const events = [
      'loadedmetadata',
      'durationchange',
      'canplay',
      'play',
      'pause',
      'seeking',
      'seeked',
      'ended',
      'volumechange',
      'error',
      'emptied',
    ];
    events.forEach((name) => video.addEventListener(name, this.readStatus));
    video.addEventListener('timeupdate', this.readTime);
    video.addEventListener('ended', this.onEnded);
    this.cleanup = () => {
      cancelAnimationFrame(this.frame);
      events.forEach((name) => video.removeEventListener(name, this.readStatus));
      video.removeEventListener('timeupdate', this.readTime);
      video.removeEventListener('ended', this.onEnded);
    };
    this.readStatus();
  };
  seek = (timeMs: number) => {
    if (this.element && this.status.ready) {
      const target = this.element.paused ? timeMs : this.positionInLoop(timeMs);
      const min = this.playbackRange?.startMs ?? 0;
      const max = this.playbackRange?.endMs ?? this.status.durationMs;
      this.element.currentTime = Math.max(min, Math.min(max, target)) / 1000;
      this.readTime();
    }
  };
  toggle = async () => {
    if (!this.element || !this.status.ready) return;
    if (this.element.paused) {
      if (this.status.preparing) return;
      const timeMs = this.element.currentTime * 1000;
      const range = this.playbackRange;
      const target =
        range && (timeMs < range.startMs || timeMs >= range.endMs)
          ? range.startMs
          : this.positionInLoop(timeMs);
      if (target !== timeMs) this.seek(target);
      await this.element.play();
    } else this.element.pause();
  };
  pause = () => this.element?.pause();
  setVolume = (volume: number) => {
    try {
      localStorage.setItem('waifu-video-volume', String(volume));
    } catch {
      /* Session setting still works. */
    }
    if (this.element) {
      this.element.muted = false;
      this.element.volume = volume;
      this.readStatus();
    } else {
      this.status = { ...this.status, volume };
      this.statusListeners.forEach((fn) => fn());
    }
  };
}
export const useTime = (media: MediaController) =>
  useSyncExternalStore(media.subscribeTime, media.getTime);
export const useMediaStatus = (media: MediaController) =>
  useSyncExternalStore(media.subscribeStatus, media.getStatus);
