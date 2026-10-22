import { expect, it, vi } from 'vitest';
import {
  AFTER_SHOW_FINISH,
  beginAfterShowAudio,
  beginAfterShowTail,
  afterShowPadInput,
  afterShowSummary,
  nextAfterShowTrack,
} from './after-show';
import { blankChart, type Chart } from './model';
import type { ChartType, Song } from './library';
import { createCalorieIndex } from './calories';

it('gives the final burst 300ms to finish before results and cancels cleanly when leaving early', () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
  const advance = (time: number) => {
    for (const [frame, callback] of [...frames]) {
      frames.delete(frame);
      callback(time);
    }
  };
  try {
    const draw = vi.fn();
    const complete = vi.fn();
    beginAfterShowTail(draw, complete);
    advance(1100);
    expect(draw).toHaveBeenLastCalledWith(1 / 3);
    advance(1299);
    expect(complete).not.toHaveBeenCalled();
    advance(1000 + AFTER_SHOW_FINISH.tailMs);
    expect(draw).toHaveBeenLastCalledWith(1);
    expect(complete).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    const cancel = beginAfterShowTail(draw, complete);
    advance(1100);
    cancel();
    advance(2000);
    expect(complete).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  } finally {
    clock.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('plays the finish accent before music and cancels a pending music cue on early exit', () => {
  vi.useFakeTimers();
  try {
    const stop = vi.fn();
    const sound = vi.fn(() => stop);
    const music = vi.fn();
    const cleanup = beginAfterShowAudio(sound, music);
    expect(sound).toHaveBeenCalledExactlyOnceWith('celebrate');
    vi.advanceTimersByTime(AFTER_SHOW_FINISH.bgmDelayMs - 1);
    expect(music).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(music).toHaveBeenCalledOnce();
    cleanup();
    expect(stop).toHaveBeenCalledOnce();
    const cancel = beginAfterShowAudio(sound, music);
    cancel();
    vi.advanceTimersByTime(AFTER_SHOW_FINISH.bgmDelayMs * 2);
    expect(music).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('summarizes the playable interval and its authored estimate, not off-range notes or pause time', () => {
  const chart: Chart = {
    ...blankChart(),
    videoOffsetMs: 200,
    playRange: { startMs: 5000, endMs: 15000 },
    tempoSegments: [
      { id: 'a', anchorMs: 0, bpm: 120, meter: '4/4' },
      { id: 'b', anchorMs: 5100, bpm: 140, meter: '4/4' },
    ],
    notes: [
      { id: 'before', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 },
      { id: 'inside', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 6000 },
      { id: 'after', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 20000 },
    ],
  };
  expect(afterShowSummary(chart, 60000)).toEqual({
    durationMs: 10000,
    bpm: 140,
    estimatedKcal: createCalorieIndex([chart.notes[1]])[0].kcal,
  });
  expect(afterShowSummary(blankChart(), 60000)).toEqual({
    durationMs: 60000,
    bpm: 120,
    estimatedKcal: 0,
  });
});

function song(id: string, updatedAt: number, type: ChartType = 'dance', albumId = 'pop'): Song {
  return {
    id,
    drafts: {},
    released: { [type]: { chart: blankChart(id), cover: '', albumId, updatedAt } },
  };
}
it('follows the album carousel, wraps, preserves type when available and never repeats a sole track', () => {
  const songs = [
    song('a', 30),
    song('b', 20, 'fitness'),
    song('c', 10),
    song('elsewhere', 50, 'dance', 'anime'),
  ];
  expect(nextAfterShowTrack(songs, 'pop', 'a', 'dance')).toMatchObject({
    song: { id: 'b' },
    chartType: 'fitness',
  });
  expect(nextAfterShowTrack(songs, 'pop', 'c', 'dance')).toMatchObject({
    song: { id: 'a' },
    chartType: 'dance',
  });
  expect(nextAfterShowTrack(songs, 'all', 'elsewhere', 'dance')?.song.id).toBe('a');
  expect(nextAfterShowTrack([songs[0]], 'pop', 'a', 'dance')).toBeUndefined();
  expect(nextAfterShowTrack([], 'pop', undefined, 'dance')).toBeUndefined();
  expect(nextAfterShowTrack(songs, 'pop', 'unpublished-draft', 'dance')?.song.id).toBe('a');
});

it('maps standard gamepad directions and confirm/back, with a stick dead zone', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { buttons, axes: [0.2, -0.2] };
  expect(afterShowPadInput(pad)).toEqual({ direction: 0, confirm: false, back: false });
  pad.axes[0] = 0.8;
  buttons[0].pressed = true;
  expect(afterShowPadInput(pad)).toEqual({ direction: 1, confirm: true, back: false });
  pad.axes[0] = 0;
  buttons[0].pressed = false;
  buttons[14].pressed = buttons[1].pressed = true;
  expect(afterShowPadInput(pad)).toEqual({ direction: -1, confirm: false, back: true });
});
