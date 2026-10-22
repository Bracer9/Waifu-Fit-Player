// Original digital-camera "ka-cha": a dry click followed by a distinct short noise release.
// Keep both syllables audible without mirror/body resonance or mechanical rattles.
import { writeFileSync } from 'node:fs';

const rate = 44100;
const samples = new Float64Array(Math.ceil(rate * 0.24));
const impacts = [
  { at: 0, gain: 1, decay: 145, attack: 0.0004, length: 0.05 },
  { at: 0.055, gain: 1.05, decay: 42, attack: 0.0015, length: 0.14 },
];
let seed = 9061;
let low = 0;
let high = 0;
let peak = 0;
for (let i = 0; i < samples.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const noise = (seed / 0x100000000) * 2 - 1;
  low += (noise - low) * 0.19;
  high += (noise - high) * 0.62;
  const clickNoise = high - low;
  const time = i / rate;
  let value = 0;
  for (const { at, gain, decay, attack, length } of impacts) {
    const t = time - at;
    if (t < 0 || t >= length) continue;
    const envelope =
      Math.min(1, t / attack) * Math.exp(-t * decay) * Math.min(1, (length - t) / 0.015);
    const snap = at === 0 ? Math.sin(2 * Math.PI * 2350 * t) * Math.exp(-t * 400) * 0.08 : 0;
    const texture = at === 0 ? clickNoise * 1.3 : clickNoise * 1.1 + (noise - low) * 0.2;
    value += gain * envelope * (texture + snap);
  }
  samples[i] = value;
  peak = Math.max(peak, Math.abs(value));
}
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((sample, i) =>
  wav.writeInt16LE(Math.round((sample / peak) * 0.74 * 32767), 44 + i * 2),
);
writeFileSync(new URL('../src/assets/menu-sfx/shutter.wav', import.meta.url), wav);
