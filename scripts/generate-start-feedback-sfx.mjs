// Rebuild start feedback; --charged-only preserves the release sound too.
// node scripts/generate-start-feedback-sfx.mjs --charged-only
import { writeFileSync } from 'node:fs';

const rate = 44100;
let seed = 0x53544152;
const noise = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
};
const envelope = (t, length, attack, decay) =>
  t >= 0 && t < length
    ? Math.min(1, t / attack) * Math.exp(-t * decay) * Math.min(1, (length - t) / 0.025)
    : 0;

function bake(name, duration, level, sample) {
  if (process.argv.includes('--charged-only') && name !== 'charged') return;
  const samples = Float64Array.from({ length: Math.ceil(rate * duration) }, (_, i) =>
    sample(i / rate),
  );
  let peak = 0;
  samples.forEach((value) => {
    peak = Math.max(peak, Math.abs(value));
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
  samples.forEach((value, i) =>
    wav.writeInt16LE(Math.round((value / peak) * level * 32767), 44 + i * 2),
  );
  writeFileSync(new URL(`../src/assets/menu-sfx/${name}.wav`, import.meta.url), wav);
  console.log(`${name}.wav: ${duration}s, peak ${level}, ${wav.length} bytes`);
}

let air = 0,
  body = 0;
bake('release', 0.26, 0.4, (t) => {
  // A short pneumatic exhale with a descending motor tail, rather than a cancel beep.
  const source = noise();
  air += (source - air) * (0.25 * Math.exp(-t * 10) + 0.025);
  body += (source - body) * 0.012;
  const hiss = (air - body) * envelope(t, 0.26, 0.006, 12);
  const phase = 2 * Math.PI * (90 * t + 190 * 0.035 * (1 - Math.exp(-t / 0.035)));
  return hiss * 1.8 + Math.sin(phase) * envelope(t, 0.23, 0.008, 21) * 0.17;
});

// One clear bell strike with a bright E6 body and short, softer metallic partials.
// No low thump, staggered chord or noise burst; the tiny attack avoids a click.
bake('charged', 0.42, 0.32, (t) =>
  [
    [1318.51, 1, 9],
    [2637.02, 0.12, 15],
    [3639.09, 0.15, 22],
  ].reduce(
    (sum, [frequency, gain, decay]) =>
      sum + Math.sin(2 * Math.PI * frequency * t) * envelope(t, 0.42, 0.003, decay) * gain,
    0,
  ),
);
