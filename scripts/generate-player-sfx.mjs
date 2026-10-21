// Original, deterministic mechanical-player sounds, baked offline. No runtime synthesis.
import { mkdirSync, writeFileSync } from 'node:fs';
const directory = new URL('../src/assets/menu-sfx/', import.meta.url);
mkdirSync(directory, { recursive: true });
const rate = 16000;
let seed = 0x574650;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x80000000 - 1;
};
function wav(name, samples, peakLevel) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF');
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) =>
    out.writeInt16LE(Math.round((sample / peak) * peakLevel * 32767), 44 + i * 2),
  );
  writeFileSync(new URL(name + '.wav', directory), out);
}

// Soft capstan/turntable whirr with band-limited bearing texture. Six-second seamless loop.
const seconds = 6,
  length = rate * seconds;
const texture = new Float64Array(length);
let low = 0,
  high = 0;
for (let i = -rate; i < length; i++) {
  low += 0.19 * (noise() - low);
  high += 0.055 * (low - high);
  if (i >= 0) texture[i] = low - high;
}
// Fold the end into the start with a short equal-amplitude crossfade.
const seam = rate / 4;
const motor = Float64Array.from({ length: length - seam }, (_, i) => {
  const t = i / rate;
  const period = (length - seam) / rate;
  const phase = (2 * Math.PI * 506 * t) / period;
  const flutter = 0.88 + 0.12 * Math.cos((2 * Math.PI * 17 * t) / period);
  const grit =
    i < seam ? texture[length - seam + i] * (1 - i / seam) + texture[i] * (i / seam) : texture[i];
  return (
    flutter * (0.33 * Math.sin(phase) + 0.07 * Math.sin(phase * 2) + 0.025 * Math.sin(phase * 3)) +
    grit * 0.7
  );
});
wav('player-run', motor, 0.13);

let air = 0;
const start = Float64Array.from({ length: Math.round(rate * 0.58) }, (_, i) => {
  const t = i / rate;
  air += 0.16 * (noise() - air);
  const envelope = Math.min(1, t / 0.035) * Math.min(1, (0.58 - t) / 0.16);
  const spin = Math.sin(2 * Math.PI * (44 * t + 70 * t * t)) * 0.18;
  const latch =
    Math.exp(-Math.pow((t - 0.34) / 0.006, 2)) *
    (0.28 * noise() + 0.18 * Math.sin(2 * Math.PI * 540 * t));
  return envelope * (spin + 0.25 * air) + latch;
});
wav('player-start', start, 0.26);
console.log('Generated player-start.wav and player-run.wav (original mechanical player ambience).');
