import { useSyncExternalStore } from 'react';
export type MediaStatus = {
  ready: boolean;
  playing: boolean;
  durationMs: number;
  rate: number;
  volume: number;
  error: string;
};
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
  private cleanup?: () => void;
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
  private readTime = () => {
    const time = (this.element?.currentTime ?? 0) * 1000;
    if (time !== this.timeMs) {
      this.timeMs = time;
      this.timeListeners.forEach((fn) => fn());
    }
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
  private tick = () => {
    this.readTime();
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
    this.cleanup = () => {
      cancelAnimationFrame(this.frame);
      events.forEach((name) => video.removeEventListener(name, this.readStatus));
      video.removeEventListener('timeupdate', this.readTime);
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
    if (this.element.paused) await this.element.play();
    else this.element.pause();
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
