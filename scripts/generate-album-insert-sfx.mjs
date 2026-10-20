// Rounded plastic latch. Rebuild only insert.wav, preserving other tuned sounds.
import { writeFileSync } from 'node:fs';
const rate = 44100,
  duration = 0.19,
  targetPeak = 0.66;
let seed = 0x534c4f54,
  softNoise = 0,
  bodyNoise = 0;
const noise = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
};
const pulse = (age, length, attack, decay) =>
  age >= 0 && age < length
    ? (1 - Math.exp(-age / attack)) * Math.exp(-age * decay) * Math.min(1, (length - age) / 0.02)
    : 0;
const samples = Float64Array.from({ length: Math.ceil(rate * duration) }, (_, i) => {
  const t = i / rate;
  softNoise += (noise() - softNoise) * 0.16;
  bodyNoise += (softNoise - bodyNoise) * 0.035;
  const friction = (softNoise - bodyNoise) * pulse(t, 0.06, 0.008, 45) * 0.26;
  const a = pulse(t - 0.012, 0.1, 0.0015, 72),
    b = pulse(t - 0.043, 0.13, 0.002, 58);
  return (
    friction +
    softNoise * (a * 0.65 + b * 0.4) +
    Math.sin(2 * Math.PI * 440 * t) * a * 0.18 +
    Math.sin(2 * Math.PI * 270 * t) * b * 0.16
  );
});
let peak = 0;
samples.forEach((s) => {
  peak = Math.max(peak, Math.abs(s));
});
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
samples.forEach((s, i) => wav.writeInt16LE(Math.round((s / peak) * targetPeak * 32767), 44 + i * 2));
writeFileSync(new URL('../src/assets/menu-sfx/insert.wav', import.meta.url), wav);
console.log(`insert.wav: ${duration}s, peak ${targetPeak}, ${wav.length} bytes`);
