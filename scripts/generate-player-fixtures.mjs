// Regenerate synthetic MP4 fixtures with ffmpeg; never read the user's maps.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const folder = new URL('../tests/fixtures/player/', import.meta.url);
mkdirSync(folder, { recursive: true });
for (const [name, seconds] of [
  ['demo.mp4', 60],
  ['endurance.mp4', 267],
]) {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x302c3b:s=1920x1080:r=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=220:sample_rate=48000',
      '-t',
      String(seconds),
      '-vf',
      'drawbox=x=100:y=100:w=400:h=80:color=0x39c5bb:t=fill',
      '-af',
      'volume=0.05',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '35',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '32k',
      '-movflags',
      '+faststart',
      fileURLToPath(new URL(name, folder)),
    ],
    { stdio: 'inherit' },
  );
}
