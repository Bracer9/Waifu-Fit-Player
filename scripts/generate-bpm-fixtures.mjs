// Regenerate tiny, synthetic test MP4s. Requires ffmpeg on PATH; no copyrighted media.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const temporary = mkdtempSync(join(tmpdir(), 'waifu-bpm-'));
const output = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(output, { recursive: true });
try {
  const rate = 48000,
    seconds = 20;
  const wav = Buffer.alloc(44 + rate * seconds * 2);
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
  wav.writeUInt32LE(wav.length - 44, 40);
  let seed = 137;
  for (let i = 0; i < rate * seconds; i++) {
    const beat = ((i / rate) * 148) / 60;
    const phase = (beat % 1) * (60 / 148);
    const hatPhase = (beat % 0.5) * (60 / 148);
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 0x80000000;
    const sample =
      0.65 * Math.sin(2 * Math.PI * 70 * phase) * Math.exp(-phase * 35) +
      (Math.floor(beat) % 2 ? 0.3 * noise * Math.exp(-phase * 45) : 0) +
      0.04 * noise * Math.exp(-hatPhase * 100);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  const audio = join(temporary, 'beats.wav');
  writeFileSync(audio, wav);
  const color = ['-f', 'lavfi', '-i', 'color=c=0x302c3b:s=160x90:r=5'];
  const encode = (args, name) =>
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...args,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        join(fileURLToPath(output), name),
      ],
      { stdio: 'inherit' },
    );
  encode(
    [...color, '-i', audio, '-t', String(seconds), '-c:a', 'aac', '-b:a', '48k'],
    'bpm-148.mp4',
  );
  encode([...color, '-t', String(seconds), '-an'], 'no-audio.mp4');
} finally {
  const target = resolve(temporary);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('waifu-bpm-'))
    throw new Error('Unexpected temporary fixture directory.');
  rmSync(target, { recursive: true, force: true });
}
