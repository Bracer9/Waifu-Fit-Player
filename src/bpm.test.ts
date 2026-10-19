import { describe, expect, it } from 'vitest';
import { BpmEnvelope, estimateBpm } from './bpm';

function drums(bpm: number, { stereo = false, intro = 0 } = {}) {
  const rate = 8000,
    seconds = 24;
  const audio = new Float32Array(rate * seconds);
  let seed = 137;
  for (let i = Math.round(intro * rate); i < audio.length; i++) {
    const time = i / rate - intro;
    const beat = (time * bpm) / 60;
    const phase = (beat % 1) * (60 / bpm);
    const hatPhase = (beat % 0.5) * (60 / bpm);
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 0x80000000;
    audio[i] =
      0.65 * Math.sin(2 * Math.PI * 70 * phase) * Math.exp(-phase * 35) +
      (Math.floor(beat) % 2 ? 0.3 * noise * Math.exp(-phase * 45) : 0) +
      0.04 * noise * Math.exp(-hatPhase * 100);
  }
  const envelope = new BpmEnvelope(seconds);
  for (let i = 0; i < audio.length; i += 1024) {
    const left = audio.slice(i, i + 1024);
    envelope.push(stereo ? [left, Float32Array.from(left, (v) => -v)] : [left], rate, i / rate);
  }
  return estimateBpm(envelope.onsets());
}

describe('video audio BPM detection', () => {
  it.each([75, 90, 120, 148, 174, 196])(
    'detects %i BPM with drums and eighth-note hi-hats',
    (bpm) => {
      expect(drums(bpm)?.bpm).toBeCloseTo(bpm, 0);
    },
  );

  it('handles a silent intro and opposite-phase stereo', () => {
    expect(drums(148, { stereo: true, intro: 6 })?.bpm).toBeCloseTo(148, 0);
  });

  it('rejects silence, short clips, and unmodulated tones', () => {
    expect(estimateBpm(new Float32Array(4000))).toBeNull();
    expect(estimateBpm(Float32Array.from({ length: 800 }, (_, i) => (i % 100 ? 0 : 1)))).toBeNull();
    const rate = 8000;
    const tone = Float32Array.from(
      { length: rate * 12 },
      (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3,
    );
    const envelope = new BpmEnvelope(12);
    envelope.push([tone], rate, 0);
    expect(estimateBpm(envelope.onsets())).toBeNull();
  });

  it('rejects nonrhythmic noise', () => {
    let seed = 190;
    const noise = Float32Array.from({ length: 6000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return Math.max(0, seed / 0x80000000);
    });
    expect(estimateBpm(noise)).toBeNull();
  });
});
