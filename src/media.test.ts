import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaController, audioOutputErrorMessage, previewFadeOutGain } from './media';

it('试听仅在末尾淡出，回跳或拖回中段恢复原音量，短片段也保留正常开头', () => {
  const range = { start: 15, end: 45 };
  expect(previewFadeOutGain(15, range)).toBe(1);
  expect(previewFadeOutGain(30, range)).toBe(1);
  expect(previewFadeOutGain(44.3, range)).toBe(1);
  expect(previewFadeOutGain(44.65, range)).toBeCloseTo(0.5);
  expect(previewFadeOutGain(45, range)).toBe(0);
  expect(previewFadeOutGain(46, range)).toBe(0);
  expect(previewFadeOutGain(15, range)).toBe(1);
  expect(previewFadeOutGain(0, { start: 0, end: 0.4 })).toBe(1);
  expect(previewFadeOutGain(0.3, { start: 0, end: 0.4 })).toBeCloseTo(0.5);
});

it('音频输出故障不误报为视频格式错误', () => {
  expect(
    audioOutputErrorMessage({
      message: 'PipelineStatus::AUDIO_RENDERER_ERROR: audio render error',
    }),
  ).toContain('音频无法播放');
  expect(audioOutputErrorMessage({ message: 'PIPELINE_ERROR_DECODE' })).toBe('');
  expect(audioOutputErrorMessage(null)).toBe('');
});

class Video extends EventTarget {
  currentTime = 0;
  readyState = 4;
  paused = false;
  ended = false;
  seeking = false;
  duration = 60;
  playbackRate = 1;
  muted = false;
  volume = 0.7;
  error = null;
  play = async () => {
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event('play'));
  };
  pause = () => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  };
}
let callbacks: Map<number, FrameRequestCallback>;
beforeEach(() => {
  callbacks = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
});

it('does not repeat native seeks for unchanged or clamped slider positions', () => {
  const media = new MediaController();
  const video = new Video();
  video.paused = true;
  let actual = 2;
  const write = vi.fn((target: number) => {
    actual = target;
  });
  Object.defineProperty(video, 'currentTime', { get: () => actual, set: write });
  media.attach(video as unknown as HTMLVideoElement);
  media.seek(0);
  for (let i = 0; i < 10; i++) media.seek(0);
  media.seek(-100);
  expect(write).toHaveBeenCalledTimes(1);
  expect(media.getTime()).toBe(0);
  media.seek(1250);
  expect(write).toHaveBeenCalledTimes(2);
  expect(actual).toBe(1.25);
  media.attach(null);
});

it('游戏音量可在加载视频前设置，播放器改音量后下次仍沿用', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const media = new MediaController();
  const changed = vi.fn();
  media.subscribeStatus(changed);
  media.setVolume(0.25);
  expect(media.getStatus().volume).toBe(0.25);
  expect(changed).toHaveBeenCalledOnce();
  const video = new Video();
  media.attach(video as unknown as HTMLVideoElement);
  expect(video.volume).toBe(0.25);
  media.setVolume(0.2);
  expect(video.volume).toBe(0.2);
  expect(new MediaController().getStatus().volume).toBe(0.2);
  media.attach(null);
});

describe('工作台区间循环', () => {
  it('资源准备中所有播放入口共用同一个拦截，准备完成后正常播放', async () => {
    const media = new MediaController(),
      video = new Video();
    video.paused = true;
    media.attach(video as unknown as HTMLVideoElement);
    media.setPreparing(true);
    video.dispatchEvent(new Event('canplay'));
    await media.toggle();
    expect(video.paused).toBe(true);
    media.setPreparing(false);
    await media.toggle();
    expect(video.paused).toBe(false);
    media.attach(null);
  });
  it.each([
    [65725, 73833, 0.000001],
    [12345, 22345, 0.002],
    [91000, 95500, 0.02],
  ])('回跳 %i–%i ms 后读数向下取整 %f s，不重复 seek', async (startMs, endMs, rounding) => {
    const media = new MediaController(),
      video = new Video();
    video.duration = 120;
    let actual = (endMs + 1) / 1000,
      writes = 0;
    Object.defineProperty(video, 'currentTime', {
      get: () => actual,
      set: (target: number) => {
        actual = target - rounding;
        writes++;
      },
    });
    media.attach(video as unknown as HTMLVideoElement);
    media.setLoopRange({ startMs, endMs });
    video.dispatchEvent(new Event('timeupdate'));
    for (let i = 0; i < 10; i++) {
      video.dispatchEvent(new Event('seeked'));
      video.dispatchEvent(new Event('canplay'));
      video.dispatchEvent(new Event('timeupdate'));
    }
    expect(writes).toBe(1);
    expect(media.getTime()).toBeCloseTo(startMs - rounding * 1000, 3);
    actual = (startMs + 500) / 1000;
    video.dispatchEvent(new Event('timeupdate'));
    expect(media.getTime()).toBe(startMs + 500);
    media.pause();
    await media.toggle();
    expect(writes).toBe(1);
    media.attach(null);
  });
  it('跨过终点直接重定位视频，暂停时可以自由定位，重新播放从范围内开始', async () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    media.setLoopRange({ startMs: 2000, endMs: 4000 });
    video.currentTime = 4.15;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(2);
    expect(media.getTime()).toBe(2000);
    media.pause();
    media.seek(8000);
    expect(media.getTime()).toBe(8000);
    await media.toggle();
    expect(video.currentTime).toBe(2);
    expect(media.getStatus().playing).toBe(true);
    media.seek(1000);
    expect(video.currentTime).toBe(2);
    media.setLoopRange({ startMs: 5000, endMs: 7000 });
    expect(video.currentTime).toBe(5);
    media.setLoopRange(null);
    video.currentTime = 4.2;
    video.dispatchEvent(new Event('timeupdate'));
    expect(media.getTime()).toBe(4200);
    media.attach(null);
  });
  it('终点位于视频结尾时仍可循环，卸载后不再自动播放', () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    media.setLoopRange({ startMs: 58000, endMs: 60000 });
    video.currentTime = 60;
    video.ended = true;
    video.paused = true;
    video.dispatchEvent(new Event('ended'));
    expect(video.currentTime).toBe(58);
    expect(video.paused).toBe(false);
    media.attach(null);
    video.currentTime = 60;
    video.paused = true;
    video.dispatchEvent(new Event('ended'));
    expect(video.paused).toBe(true);
    expect(callbacks.size).toBe(0);
  });
});
describe('曲终通知', () => {
  it('ignores an early ended event even if the video reports ended, without completing the session', () => {
    const media = new MediaController(),
      video = new Video();
    video.duration = 101.9;
    media.attach(video as unknown as HTMLVideoElement);
    const ended = vi.fn();
    media.subscribeEnded(ended);
    video.currentTime = 0.8;
    video.paused = video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(ended).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0.8);
    video.currentTime = video.duration;
    video.dispatchEvent(new Event('ended'));
    video.dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalledOnce();
    media.attach(null);
  });
  it('does not accept an ended event during a seek, without metadata, or before the published endpoint', () => {
    const media = new MediaController(),
      video = new Video();
    video.paused = true;
    media.attach(video as unknown as HTMLVideoElement);
    media.setPlaybackRange({ startMs: 5000, endMs: 15000 });
    const ended = vi.fn();
    media.subscribeEnded(ended);
    video.ended = true;
    video.currentTime = 8;
    video.dispatchEvent(new Event('ended'));
    video.currentTime = 15;
    video.seeking = true;
    video.dispatchEvent(new Event('ended'));
    video.seeking = false;
    video.readyState = 0;
    video.dispatchEvent(new Event('ended'));
    expect(ended).not.toHaveBeenCalled();
    video.readyState = 4;
    video.ended = false;
    video.dispatchEvent(new Event('ended'));
    expect(ended).not.toHaveBeenCalled();
    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalledOnce();
    media.attach(null);
  });
  it('restarts and reloads the same video element without accepting stale end notifications', async () => {
    const media = new MediaController(),
      video = new Video();
    video.paused = true;
    media.attach(video as unknown as HTMLVideoElement);
    const ended = vi.fn();
    media.subscribeEnded(ended);
    for (let attempt = 0; attempt < 3; attempt++) {
      // Restart seeks; selecting another source can also reuse this element.
      if (attempt === 2) {
        video.duration = 101.9;
        video.currentTime = 0;
        video.dispatchEvent(new Event('loadedmetadata'));
      }
      media.seek(0);
      video.dispatchEvent(new Event('ended'));
      expect(ended).toHaveBeenCalledTimes(attempt);
      await media.toggle();
      video.currentTime = 0.8;
      video.dispatchEvent(new Event('ended'));
      expect(ended).toHaveBeenCalledTimes(attempt);
      video.currentTime = video.duration;
      video.paused = video.ended = true;
      video.dispatchEvent(new Event('ended'));
      expect(ended).toHaveBeenCalledTimes(attempt + 1);
    }
    media.attach(null);
  });
  it('range completion fires once after stopping; restart re-arms it and paused seeks do not finish', async () => {
    const media = new MediaController(),
      video = new Video();
    video.paused = true;
    media.attach(video as unknown as HTMLVideoElement);
    media.setPlaybackRange({ startMs: 5000, endMs: 10000 });
    const ended = vi.fn(() => expect(video.paused).toBe(true));
    const unsubscribe = media.subscribeEnded(ended);
    media.seek(10000);
    expect(ended).not.toHaveBeenCalled();
    await media.toggle();
    video.currentTime = 10.05;
    video.dispatchEvent(new Event('timeupdate'));
    expect(ended).toHaveBeenCalledOnce();
    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalledOnce();
    media.seek(5000);
    await media.toggle();
    video.currentTime = 10;
    video.dispatchEvent(new Event('timeupdate'));
    expect(ended).toHaveBeenCalledTimes(2);
    unsubscribe();
    media.attach(null);
  });
  it('native full-video end notifies, while editor loop end continues looping', () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    const ended = vi.fn();
    media.subscribeEnded(ended);
    media.setLoopRange({ startMs: 1000, endMs: 2000 });
    video.currentTime = 60;
    video.paused = video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(ended).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(1);
    media.setLoopRange(null);
    video.currentTime = 60;
    video.paused = video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(60);
    media.attach(null);
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('published playback range', () => {
  it('seeks to the range start, stops video/audio at its end, and replays from its start', async () => {
    const media = new MediaController(),
      video = new Video();
    video.paused = true;
    media.attach(video as unknown as HTMLVideoElement);
    media.setPlaybackRange({ startMs: 5000, endMs: 15000 });
    expect(video.currentTime).toBe(5);
    media.seek(2000);
    expect(video.currentTime).toBe(5);
    await media.toggle();
    video.currentTime = 15.08;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(15);
    expect(video.paused).toBe(true);
    expect(media.getTime()).toBe(15000);
    expect(media.getStatus().playing).toBe(false);
    await media.toggle();
    expect(video.currentTime).toBe(5);
    expect(video.paused).toBe(false);
    media.attach(null);
  });
  it('initializes a newly loaded video and allows the entire source again in the editor', () => {
    const media = new MediaController(),
      video = new Video();
    video.paused = true;
    media.attach(video as unknown as HTMLVideoElement);
    media.setPlaybackRange({ startMs: 5000, endMs: 15000 });
    video.currentTime = 0;
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(5);
    media.setPlaybackRange(null);
    media.seek(20000);
    expect(video.currentTime).toBe(20);
    media.attach(null);
  });
  it('never loops a published range even while the editor loop cleanup is pending', () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    media.setLoopRange({ startMs: 2000, endMs: 4000 });
    media.setPlaybackRange({ startMs: 5000, endMs: 10000 });
    video.currentTime = 10.1;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(10);
    expect(video.paused).toBe(true);
    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(video.paused).toBe(true);
    media.attach(null);
  });
});
let frameTime = 0;
function frame(timestamp = (frameTime += 1000 / 60)) {
  const next = [...callbacks.values()];
  callbacks.clear();
  next.forEach((callback) => callback(timestamp));
}
describe('媒体时钟不受渲染掉帧影响', () => {
  it.each([60, 120, 144, 165, 240])('%i Hz 下游玩档位独立更新，常规订阅保持 60 Hz', (hz) => {
    for (const rate of [60, 120, 'display'] as const) {
      const media = new MediaController(),
        video = new Video();
      media.setRenderFrameRate(rate);
      media.attach(video as unknown as HTMLVideoElement);
      const render = vi.fn(),
        shared = vi.fn();
      const unsubscribe = media.subscribeRenderTime(render);
      media.subscribeTime(shared);
      for (let i = 0; i < hz; i++) {
        video.currentTime = i / hz;
        frame((i * 1000) / hz);
      }
      const target = rate === 'display' ? hz : Math.min(rate, hz);
      expect(render.mock.calls.length).toBeGreaterThanOrEqual(target - 2);
      expect(render.mock.calls.length).toBeLessThanOrEqual(target);
      expect(shared.mock.calls.length).toBeGreaterThanOrEqual(58);
      expect(shared.mock.calls.length).toBeLessThanOrEqual(60);
      expect(video.playbackRate).toBe(1);
      unsubscribe();
      media.attach(null);
      expect(callbacks.size).toBe(0);
    }
  });
  it('切档、暂停、回拖与恢复同步绘制快照，不新增播放循环或外推时间', async () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    media.subscribeRenderTime(vi.fn());
    media.setRenderFrameRate(120);
    video.currentTime = 3.25;
    frame(1000);
    expect(media.getRenderTime()).toBe(3250);
    frame(1008.33);
    expect(media.getRenderTime()).toBe(3250);
    media.setRenderFrameRate('display');
    video.currentTime = 3.26;
    frame(1012);
    expect(media.getRenderTime()).toBe(3260);
    expect(callbacks.size).toBe(1);
    media.pause();
    expect(callbacks.size).toBe(0);
    media.seek(2100);
    expect(media.getTime()).toBe(2100);
    expect(media.getRenderTime()).toBe(2100);
    media.setRenderFrameRate(60);
    await media.toggle();
    video.currentTime = 5.7;
    frame(5000);
    expect(media.getTime()).toBe(5700);
    expect(media.getRenderTime()).toBe(5700);
    expect(callbacks.size).toBe(1);
    media.attach(null);
    expect(callbacks.size).toBe(0);
  });
  it('高帧率绘制不会越过游玩结束时间，结束事件仍只触发一次', () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    media.setPlaybackRange({ startMs: 0, endMs: 10000 });
    media.setRenderFrameRate(120);
    media.subscribeRenderTime(vi.fn());
    const ended = vi.fn();
    media.subscribeEnded(ended);
    video.currentTime = 9.99;
    frame(0);
    video.currentTime = 10.008;
    frame(8.33);
    expect(media.getRenderTime()).toBe(10000);
    frame(16.67);
    expect(video.paused).toBe(true);
    expect(media.getTime()).toBe(10000);
    video.dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
    media.attach(null);
  });
  it.each([60, 120, 144, 240])('%i Hz 下最多每秒发布 60 次绘制，读取最新媒体时间', (hz) => {
    const media = new MediaController(),
      video = new Video();
    const observed: number[] = [];
    media.attach(video as unknown as HTMLVideoElement);
    media.subscribeTime(() => observed.push(media.getTime()));
    for (let i = 0; i < hz; i++) {
      video.currentTime = i / hz;
      frame((i * 1000) / hz);
    }
    expect(observed.length).toBeGreaterThanOrEqual(58);
    expect(observed.length).toBeLessThanOrEqual(60);
    video.currentTime = 4;
    frame(4000);
    expect(media.getTime()).toBe(4000);
    media.attach(null);
  });
  it('漏掉多个绘制帧后立即读取视频时间，不补播动画或累积偏移', () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    video.currentTime = 3.25;
    frame();
    expect(media.getTime()).toBe(3250);
    // No callbacks while the renderer is busy, but media/audio continues advancing.
    video.currentTime = 5.7;
    frame();
    expect(media.getTime()).toBe(5700);
    expect(callbacks.size).toBe(1);
    media.attach(null);
    expect(callbacks.size).toBe(0);
  });
  it('变速、停滞、暂停和回拖均跟随媒体，不按墙钟外推', () => {
    const media = new MediaController(),
      video = new Video();
    media.attach(video as unknown as HTMLVideoElement);
    video.currentTime = 8;
    video.playbackRate = 1.5;
    frame();
    frame();
    expect(media.getTime()).toBe(8000);
    video.paused = true;
    video.dispatchEvent(new Event('pause'));
    expect(callbacks.size).toBe(0);
    video.currentTime = 2.1;
    video.dispatchEvent(new Event('seeked'));
    expect(media.getTime()).toBe(2100);
    video.paused = false;
    video.dispatchEvent(new Event('play'));
    video.currentTime = 2.4;
    frame();
    expect(media.getTime()).toBe(2400);
    media.attach(null);
  });
});
