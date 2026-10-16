import { useSyncExternalStore } from 'react';
export type MediaStatus = {
  ready: boolean;
  playing: boolean;
  durationMs: number;
  rate: number;
  volume: number;
  error: string;
};
export type LoopRange = { startMs: number; endMs: number };
export class MediaController {
  element: HTMLVideoElement | null = null;
  private timeMs = 0;
  private status: MediaStatus = {
    ready: false,
    playing: false,
    durationMs: 0,
    rate: 1,
    volume: 0.7,
    error: '',
  };
  private timeListeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();
  private frame = 0;
  private nextFrameAt = 0;
  private cleanup?: () => void;
  private loopRange: LoopRange | null = null;
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
  setLoopRange = (range: LoopRange | null) => {
    this.loopRange = range && range.endMs > range.startMs ? range : null;
  };
  private readTime = () => {
    const video = this.element;
    const range = this.loopRange;
    // Seek the actual video (and its audio), never rewind a separate chart clock.
    if (video && range && !video.paused && !video.seeking && !video.ended) {
      const timeMs = video.currentTime * 1000;
      if (timeMs >= range.endMs || timeMs < range.startMs) video.currentTime = range.startMs / 1000;
    }
    const time = (this.element?.currentTime ?? 0) * 1000;
    if (time !== this.timeMs) {
      this.timeMs = time;
      this.timeListeners.forEach((fn) => fn());
    }
  };
  private onEnded = () => {
    if (!this.loopRange || !this.element) return;
    this.seek(this.loopRange.startMs);
    void this.element.play().catch(this.readStatus);
  };
  private readStatus = () => {
    const v = this.element;
    if (!v) return;
    const next: MediaStatus = {
      ready: v.readyState >= 1 && !v.error,
      playing: !v.paused && !v.ended,
      durationMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0,
      rate: v.playbackRate,
      volume: v.muted ? 0 : v.volume,
      error: v.error ? '视频无法播放。请尝试 H.264 视频 + AAC 音频的 MP4 文件。' : '',
    };
    if (JSON.stringify(next) !== JSON.stringify(this.status)) {
      this.status = next;
      this.statusListeners.forEach((fn) => fn());
    }
    this.readTime();
    cancelAnimationFrame(this.frame);
    if (next.playing) this.frame = requestAnimationFrame(this.tick);
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
      'ratechange',
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
      this.element.currentTime = Math.max(0, Math.min(this.status.durationMs, timeMs)) / 1000;
      this.readTime();
    }
  };
  toggle = async () => {
    if (!this.element || !this.status.ready) return;
    if (this.element.paused) {
      const range = this.loopRange;
      const timeMs = this.element.currentTime * 1000;
      if (range && (timeMs < range.startMs || timeMs >= range.endMs)) this.seek(range.startMs);
      await this.element.play();
    } else this.element.pause();
  };
  pause = () => this.element?.pause();
  setRate = (rate: number) => {
    if (this.element) this.element.playbackRate = rate;
  };
  setVolume = (volume: number) => {
    if (this.element) {
      this.element.muted = false;
      this.element.volume = volume;
    }
  };
}
export const useTime = (media: MediaController) =>
  useSyncExternalStore(media.subscribeTime, media.getTime);
export const useMediaStatus = (media: MediaController) =>
  useSyncExternalStore(media.subscribeStatus, media.getStatus);
