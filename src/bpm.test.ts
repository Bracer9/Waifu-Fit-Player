import { describe, expect, it } from 'vitest';
import { analyzeTempo, BpmEnvelope, estimateBpm } from './bpm';
import { gunzipSync } from 'node:zlib';
import renai from '../tests/fixtures/renai-bpm-onsets.json';

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

  it('recognizes beats with small attack-time variations over a noisy mix', () => {
    let seed = 37;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    const onsets = Float32Array.from({ length: 18000 }, () => random() * 0.5);
    for (let beat = 0; beat < 170; beat++) {
      const index = Math.round((beat * 200 * 60) / 114) + Math.floor(random() * 5) - 2;
      if (index >= 0 && index < onsets.length) onsets[index] += 2;
    }
    expect(estimateBpm(onsets)?.bpm).toBeCloseTo(114, 0);
  });
});

function changingBeats(first: number, second: number) {
  const onsets = new Float32Array(200 * 48);
  for (let part = 0; part < 2; part++) {
    const bpm = part ? second : first;
    for (let time = part * 24 + 0.2; time < (part + 1) * 24; time += 60 / bpm) {
      const index = Math.round(time * 200);
      for (let j = 0; j < 5 && index + j < onsets.length; j++)
        onsets[index + j] += [0.2, 0.7, 1, 0.6, 0.2][j];
    }
  }
  return onsets;
}

describe('tempo consistency within the analyzed interval', () => {
  it('keeps the full 134 BPM estimate for Renai Saiban despite weak 67/89/177 window aliases', () => {
    const bytes = gunzipSync(Buffer.from(renai.data, 'base64'));
    const onsets = Float32Array.from(
      { length: renai.samples },
      (_, i) => bytes.readUInt16LE(i * 2) / renai.scale,
    );
    const result = analyzeTempo(onsets, renai.sampleRate);
    expect(result.kind).toBe('stable');
    if (result.kind === 'stable') expect(result.result.bpm).toBeCloseTo(134, 0);
  });
  it.each([
    [120, 90],
    [90, 150],
    [148, 114],
    [120, 60],
  ])('reports sustained %i → %i instead of returning one averaged BPM', (first, second) => {
    const analysis = analyzeTempo(changingBeats(first, second));
    expect(analysis.kind).toBe('varying');
    if (analysis.kind === 'varying') {
      expect(analysis.bpms).toContain(first);
      expect(analysis.bpms).toContain(second);
      expect(analysis.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps a constant tempo and rejects silence', () => {
    const analysis = analyzeTempo(changingBeats(120, 120));
    expect(analysis.kind).toBe('stable');
    if (analysis.kind === 'stable') expect(analysis.result.bpm).toBeCloseTo(120, 0);
    expect(analyzeTempo(new Float32Array(200 * 48))).toEqual({ kind: 'unclear' });
  });
});
