import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaController, audioOutputErrorMessage } from './media';

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
afterEach(() => vi.unstubAllGlobals());
let frameTime = 0;
function frame(timestamp = (frameTime += 1000 / 60)) {
  const next = [...callbacks.values()];
  callbacks.clear();
  next.forEach((callback) => callback(timestamp));
}
describe('媒体时钟不受渲染掉帧影响', () => {
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
