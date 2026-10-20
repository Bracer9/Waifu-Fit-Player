// Original water-like transition sound, baked offline. No runtime synthesis.
// node scripts/generate-liquid-sfx.mjs
import { writeFileSync } from 'node:fs';

const rate = 44100;
const duration = 2.46; // 880ms cover + 200ms covered + 1380ms retreat.
const samples = new Float64Array(Math.ceil(rate * duration));
let seed = 0x574650;
let slow = 0;
const swell = (time, start, length) => {
  const p = (time - start) / length;
  return p > 0 && p < 1 ? Math.sin(Math.PI * p) ** 1.5 : 0;
};
const droplets = [
  // Rounded little "blup" pairs: rising bubble resonance, no crashing wave.
  [0.12, 340, 0.13],
  [0.26, 490, 0.1],
  [0.49, 390, 0.12],
  [0.72, 570, 0.08],
  [0.94, 440, 0.11],
  [1.17, 370, 0.09],
  [1.37, 520, 0.07],
  [1.62, 420, 0.055],
  [2.04, 600, 0.035],
];
let peak = 0;
for (let i = 0; i < samples.length; i++) {
  const t = i / rate;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  const motion = swell(t, 0.03, 0.98) + 0.6 * swell(t, 1.08, 1.12);
  // Barely audible, low-passed underwater air; the individual bubbles lead.
  slow += (noise - slow) * 0.012;
  let sample = slow * motion * 0.018;
  for (const [start, frequency, level] of droplets) {
    for (const [delay, gain] of [
      [0, 1],
      [0.065, 0.13],
    ]) {
      const age = t - start - delay;
      if (age < 0 || age > 0.24) continue;
      const attack = Math.min(1, age / 0.009);
      const envelope = attack * attack * Math.exp(-age * 24) * Math.min(1, (0.24 - age) / 0.04);
      const phase =
        2 * Math.PI * frequency * (age + 0.72 * (age - 0.035 * (1 - Math.exp(-age / 0.035))));
      sample += level * gain * envelope * (Math.sin(phase) + 0.06 * Math.sin(phase * 2));
    }
  }
  samples[i] = sample;
  peak = Math.max(peak, Math.abs(sample));
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
samples.forEach((value, i) =>
  wav.writeInt16LE(Math.round((value / peak) * 0.285 * 32767), 44 + i * 2),
);
writeFileSync(new URL('../src/assets/menu-sfx/liquid.wav', import.meta.url), wav);
console.log(`Generated liquid.wav: ${duration}s, ${wav.length} bytes, peak -10.9 dBFS (+50% gain).`);
