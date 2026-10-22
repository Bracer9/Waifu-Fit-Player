// Original bright stereo major arpeggio, synthesized offline; no drum/pop layer.
import { writeFileSync } from 'node:fs';
const rate = 22050;
const seconds = 0.95;
const count = Math.ceil(rate * seconds);
const samples = new Float64Array(count * 2);
const notes = [523.25, 659.25, 783.99, 1046.5];
let peak = 0;
for (let frame = 0; frame < count; frame++) {
  for (let channel = 0; channel < 2; channel++) {
    const time = frame / rate - channel * 0.012;
    let value = 0;
    if (time >= 0) {
      notes.forEach((frequency, index) => {
        const t = time - 0.065 - index * 0.065;
        if (t < 0) return;
        const envelope =
          Math.min(1, t / 0.004) * Math.exp(-t * 8) * Math.min(1, (seconds - time) / 0.06);
        value +=
          (Math.sin(2 * Math.PI * frequency * t) * 0.13 +
            Math.sin(4 * Math.PI * frequency * t) * 0.025) *
          envelope;
      });
    }
    samples[frame * 2 + channel] = value;
    peak = Math.max(peak, Math.abs(value));
  }
}
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((sample, i) =>
  wav.writeInt16LE(Math.round((sample / peak) * 0.55 * 32767), 44 + i * 2),
);
writeFileSync(new URL('../src/assets/menu-sfx/celebrate.wav', import.meta.url), wav);
