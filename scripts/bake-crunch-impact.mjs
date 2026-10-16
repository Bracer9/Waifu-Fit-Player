// Bake the accent's glow offline. Playback draws one small sprite, without live filters.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../public/art/crunch/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const images = await page.evaluate(() => {
    const width = 256,
      height = 128,
      frames = 32,
      columns = 8;
    const atlas = document.createElement('canvas');
    atlas.width = width * columns;
    atlas.height = height * (frames / columns);
    const target = atlas.getContext('2d');
    for (let frame = 0; frame < frames; frame++) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const c = canvas.getContext('2d');
      const p = frame / (frames - 1),
        ease = 1 - (1 - p) ** 4;
      const fade = (1 - p) ** 1.6;
      const x = 190,
        y = 64;
      const polygon = (points, color, glow, alpha = fade) => {
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = color;
        c.shadowColor = '#39c5bb';
        c.shadowBlur = glow;
        c.beginPath();
        points.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
        c.closePath();
        c.fill();
        c.restore();
      };
      const reach = 20 + ease * 155;
      const band = 3 + (1 - p) * 6;
      polygon(
        [
          [x - reach, y],
          [x - 22, y - band],
          [x + 35 * ease, y],
          [x - 22, y + band],
        ],
        '#39c5bb',
        13,
      );
      polygon(
        [
          [x - reach, y],
          [x - 14, y - 2],
          [x + 37 * ease, y],
          [x - 14, y + 2],
        ],
        '#eafffa',
        5,
      );
      // Four broad diagonal chips, with a short travel and generous empty space.
      for (const [dx, dy, angle] of [
        [-1, -1, -0.5],
        [-1, 1, 0.5],
        [1, -1, -0.9],
        [1, 1, 0.9],
      ]) {
        const distance = 10 + ease * (dx < 0 ? 62 : 28);
        c.save();
        c.translate(x + dx * distance, y + dy * (10 + ease * 22));
        c.rotate(angle);
        polygon(
          [
            [-9, 0],
            [-3, -2.5],
            [9, 0],
            [3, 2.5],
          ],
          '#cffff6',
          5,
        );
        c.restore();
      }
      const flash = Math.max(0, 1 - p * 3.8);
      const size = 18 - ease * 8;
      polygon(
        [
          [x - size, y],
          [x, y - size * 1.65],
          [x + size, y],
          [x, y + size * 1.65],
        ],
        '#faffff',
        12,
        flash,
      );
      target.drawImage(canvas, (frame % columns) * width, Math.floor(frame / columns) * height);
    }
    const trail = document.createElement('canvas');
    trail.width = 128;
    trail.height = 48;
    const c = trail.getContext('2d');
    const gradient = c.createLinearGradient(0, 0, 128, 0);
    gradient.addColorStop(0, '#39c5bb00');
    gradient.addColorStop(0.65, '#39c5bb90');
    gradient.addColorStop(1, '#bffff0');
    c.fillStyle = gradient;
    c.shadowColor = '#39c5bb';
    c.shadowBlur = 5;
    c.beginPath();
    c.moveTo(4, 24);
    c.lineTo(116, 14);
    c.lineTo(116, 34);
    c.closePath();
    c.fill();
    return { impact: atlas.toDataURL('image/png'), trail: trail.toDataURL('image/png') };
  });
  for (const [name, image] of Object.entries(images))
    await writeFile(new URL(`${name}.png`, output), Buffer.from(image.split(',')[1], 'base64'));
  console.log('Baked SIDE CRUNCH impact and trail.');
} finally {
  await browser.close();
}
