import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaController } from './media';

class Video extends EventTarget {
  currentTime = 0;
  readyState = 4;
  paused = false;
  ended = false;
  duration = 60;
  playbackRate = 1;
  muted = false;
  volume = 0.7;
  error = null;
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
    video.dispatchEvent(new Event('ratechange'));
    expect(media.getStatus().rate).toBe(1.5);
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
