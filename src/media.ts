import { useSyncExternalStore } from 'react';

/** Fade a preview's final 700ms on its media clock; leave the beginning unchanged. */
export function previewFadeOutGain(time: number, range: { start: number; end: number }): number {
  const duration = Math.min(0.7, (range.end - range.start) / 2);
  if (duration <= 0) return 0;
  const remaining = Math.max(0, Math.min(1, (range.end - time) / duration));
  return remaining * remaining * (3 - 2 * remaining);
}

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
export type GameplayFrameRate = 60 | 120 | 'display';
export class MediaController {
  element: HTMLVideoElement | null = null;
  private timeMs = 0;
  private renderTimeMs = 0;
  private renderFrameRate: GameplayFrameRate = 60;
  private renderListeners = new Set<() => void>();
  private nextRenderFrameAt = 0;
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
  private endListeners = new Set<() => void>();
  private completed = false;
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
  // Only the gameplay lanes subscribe here. Transport, statistics and the editor
  // retain the existing 60 Hz publication cadence.
  subscribeRenderTime = (listener: () => void) => {
    this.renderListeners.add(listener);
    return () => {
      this.renderListeners.delete(listener);
    };
  };
  getRenderTime = () => this.renderTimeMs;
  setRenderFrameRate = (rate: GameplayFrameRate) => {
    if (rate === this.renderFrameRate) return;
    this.renderFrameRate = rate;
    this.nextRenderFrameAt = 0;
  };
  private publishRenderTime = (time: number) => {
    if (time === this.renderTimeMs) return;
    this.renderTimeMs = time;
    this.renderListeners.forEach((fn) => fn());
  };
  subscribeStatus = (listener: () => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };
  getTime = () => this.timeMs;
  getStatus = () => this.status;
  subscribeEnded = (listener: () => void) => {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  };
  private completePlayback = () => {
    if (this.completed) return;
    this.completed = true;
    this.endListeners.forEach((fn) => fn());
  };
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
  private readTime = () => this.updateTime(true);
  private updateTime = (syncRender: boolean) => {
    const video = this.element;
    const range = this.playbackRange ? null : this.loopRange;
    const playbackEnd = this.playbackRange?.endMs;
    let finished = false;
    if (
      video &&
      playbackEnd !== undefined &&
      !video.paused &&
      !video.seeking &&
      video.currentTime * 1000 >= playbackEnd
    ) {
      video.currentTime = playbackEnd / 1000;
      video.pause();
      finished = true;
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
    // Commands and media events (seek, pause, end) synchronize both snapshots.
    if (syncRender || !this.renderListeners.size) this.publishRenderTime(time);
    if (finished) this.completePlayback();
  };
  private onEnded = () => {
    const video = this.element;
    if (!video || video.readyState < 1 || video.seeking || video.error || !video.ended) return;
    const endMs = this.playbackRange?.endMs ?? video.duration * 1000;
    // A queued/stale ended event is not proof that this playback reached its end.
    // Allow only millisecond rounding; never seek forward to manufacture completion.
    if (
      !Number.isFinite(endMs) ||
      endMs <= 0 ||
      !Number.isFinite(video.currentTime) ||
      video.currentTime * 1000 < endMs - 1
    )
      return;
    if (this.playbackRange || !this.loopRange) {
      this.completePlayback();
      return;
    }
    this.seek(this.loopRange.startMs);
    void video.play().catch(this.readStatus);
  };
  private readStatus = (event?: Event) => {
    const v = this.element;
    if (!v) return;
    if (event?.type === 'play') this.completed = false;
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
    this.nextFrameAt = this.nextRenderFrameAt = 0;
    if (!v.paused && !v.ended) this.frame = requestAnimationFrame(this.tick);
  };
  private tick = (timestamp: number) => {
    // The shared clock stays at 60 Hz even when gameplay opts into more frames.
    const frameMs = 1000 / 60;
    if (timestamp + 0.5 >= this.nextFrameAt) {
      this.updateTime(false);
      this.nextFrameAt +=
        (Math.floor(Math.max(0, timestamp - this.nextFrameAt) / frameMs) + 1) * frameMs;
    }
    if (this.renderListeners.size) {
      const interval = this.renderFrameRate === 'display' ? 0 : 1000 / this.renderFrameRate;
      if (!interval || timestamp + 0.5 >= this.nextRenderFrameAt) {
        const video = this.element;
        const time = (video?.currentTime ?? 0) * 1000;
        this.publishRenderTime(Math.min(time, this.playbackRange?.endMs ?? Infinity));
        if (interval)
          this.nextRenderFrameAt +=
            (Math.floor(Math.max(0, timestamp - this.nextRenderFrameAt) / interval) + 1) * interval;
      }
    }
    if (this.element && !this.element.paused) this.frame = requestAnimationFrame(this.tick);
  };
  attach = (video: HTMLVideoElement | null) => {
    this.cleanup?.();
    this.element = video;
    this.completed = false;
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
      const next = Math.max(min, Math.min(max, target));
      // Repeated slider values (especially clamped zero) must not restart a seek.
      if (Math.abs(this.element.currentTime * 1000 - next) >= 1)
        this.element.currentTime = next / 1000;
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
export const useRenderTime = (media: MediaController, gameplay: boolean) =>
  useSyncExternalStore(
    gameplay ? media.subscribeRenderTime : media.subscribeTime,
    gameplay ? media.getRenderTime : media.getTime,
  );
export const useMediaStatus = (media: MediaController) =>
  useSyncExternalStore(media.subscribeStatus, media.getStatus);
