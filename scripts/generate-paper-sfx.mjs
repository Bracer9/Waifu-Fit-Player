// Quiet dry paper contact, baked once; no runtime synthesis or extra AudioContext.
import { writeFileSync } from 'node:fs';
const rate = 22050,
  count = Math.ceil(rate * 0.075);
const wav = Buffer.alloc(44 + count * 2);
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
wav.writeUInt32LE(count * 2, 40);
let seed = 43,
  smooth = 0,
  previous = 0;
for (let i = 0; i < count; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const noise = seed / 2147483648 - 1;
  smooth += (noise - smooth) * 0.44;
  const high = smooth - previous;
  previous = smooth;
  const t = i / rate;
  const envelope = Math.min(1, t / 0.003) * Math.exp(-t / 0.012) * Math.min(1, (0.075 - t) / 0.01);
  const tap = Math.sin(2 * Math.PI * 720 * t) * Math.exp(-t / 0.004) * 0.12;
  wav.writeInt16LE(Math.round((high * envelope * 0.65 + tap) * 32767), 44 + i * 2);
}
writeFileSync(new URL('../src/assets/menu-sfx/paper.wav', import.meta.url), wav);
