// Small dry plastic switch sounds synthesized offline, never in the render loop.
import { writeFileSync } from 'node:fs';

const rate = 22050;
for (const [name, duration, hits] of [
  [
    'key-down',
    0.065,
    [
      [0, 540, 0.5],
      [0.012, 1150, 0.2],
    ],
  ],
  [
    'key-lock',
    0.105,
    [
      [0, 1020, 0.42],
      [0.037, 390, 0.48],
    ],
  ],
  [
    'key-up',
    0.075,
    [
      [0, 720, 0.32],
      [0.016, 1260, 0.16],
    ],
  ],
]) {
  const count = Math.ceil(rate * duration);
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
  let seed = 19,
    low = 0;
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    low += (seed / 2147483648 - 1 - low) * 0.55;
    const t = i / rate;
    let sample = 0;
    for (const [start, frequency, gain] of hits) {
      const dt = t - start;
      if (dt < 0) continue;
      const attack = Math.min(1, dt / 0.0008);
      const body = Math.sin(2 * Math.PI * frequency * dt) * Math.exp(-dt / 0.006);
      const shell = Math.sin(2 * Math.PI * frequency * 2.37 * dt) * Math.exp(-dt / 0.003);
      sample += gain * attack * (body * 0.6 + shell * 0.14 + low * Math.exp(-dt / 0.004) * 0.7);
    }
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  writeFileSync(new URL(`../src/assets/menu-sfx/${name}.wav`, import.meta.url), wav);
}
