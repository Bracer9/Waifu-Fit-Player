// Original synthesized UI sounds; run with node scripts/generate-menu-sfx.mjs.
// Files are generated offline. The game only plays the small WAV assets.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = new URL('../src/assets/menu-sfx/', import.meta.url);
mkdirSync(directory, { recursive: true });
const rate = 44100;
const sounds = {
  mode: {
    length: 0.17,
    tones: [
      [0, 740, 0.09],
      [0.045, 1480, 0.12],
    ],
  },
  album: {
    length: 0.12,
    tones: [
      [0, 880, 0.09],
      [0.022, 1320, 0.09],
    ],
  },
  song: {
    length: 0.18,
    tones: [
      [0, 1046.5, 0.1],
      [0.05, 1568, 0.13],
    ],
  },
  settings: {
    length: 0.085,
    tones: [
      [0, 1174.7, 0.08],
      [0.008, 2349.3, 0.05],
    ],
  },
  back: {
    length: 0.12,
    tones: [
      [0, 1320, 0.07],
      [0.025, 660, 0.09],
    ],
  },
};
for (const [name, { length, tones }] of Object.entries(sounds)) {
  const samples = new Float64Array(Math.ceil(rate * length));
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / rate;
    let sample = 0;
    for (const [delay, frequency, duration] of tones) {
      const t = time - delay;
      if (t < 0 || t >= duration) continue;
      const envelope =
        Math.min(1, t / 0.002) *
        Math.exp((-5 * t) / duration) *
        Math.min(1, (duration - t) / 0.008);
      // A tiny falling pitch transient gives a crisp digital tap without a harsh square wave.
      const phase = 2 * Math.PI * (frequency * t + 0.3 * (1 - Math.exp(-t / 0.004)));
      sample += envelope * (Math.sin(phase) + 0.14 * Math.sin(phase * 2));
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
  samples.forEach((sample, i) =>
    wav.writeInt16LE(Math.round((sample / peak) * 0.55 * 32767), 44 + i * 2),
  );
  writeFileSync(new URL(`${name}.wav`, directory), wav);
}
console.log(`Generated ${Object.keys(sounds).length} menu sounds in ${fileURLToPath(directory)}`);
