// Bake glow once into small reusable textures, never run blur filters during playback.
// Icon geometry comes from lucide-react (ISC, see public/THIRD_PARTY_NOTICES.txt).
import { chromium } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Heart, Sparkles, Star } from 'lucide-react';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const output = new URL('../public/art/special/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const sprites = [];
  for (const [name, Icon] of Object.entries({ heart: Heart, star: Star, sparkles: Sparkles })) {
    const icon = renderToStaticMarkup(createElement(Icon, { strokeWidth: 3.6 }));
    sprites.push({
      name,
      viewBox: '-12 -12 48 48',
      size: 288,
      content: `<style>svg{overflow:visible;fill:#faffff;stroke:#f64e93;stroke-linejoin:round;paint-order:stroke fill;filter:drop-shadow(0 0 .4px white) drop-shadow(0 0 1.3px #f64e93) drop-shadow(0 0 3.3px #f64e9390)}.lucide-sparkles path:not(:first-child){stroke:#35c9db;stroke-width:1.3;fill:none}</style>${icon}`,
    });
  }
  for (const [name, color] of Object.entries({
    white: '#faffff',
    pink: '#f64e93',
    cyan: '#35c9db',
  })) {
    for (const shape of ['star', 'streak'])
      sprites.push({
        name: `${shape}-${name}`,
        viewBox: '0 0 32 32',
        size: 96,
        content: `<g style="filter:drop-shadow(0 0 1px white) drop-shadow(0 0 3px ${color});fill:${color}">${shape === 'star' ? '<path d="M16 11L17 15L21 16L17 17L16 21L15 17L11 16L15 15Z"/>' : '<rect x="9" y="15.25" width="14" height="1.5" rx=".75"/>'}</g>`,
      });
  }
  for (const [name, color] of Object.entries({ pink: '#f64e93', cyan: '#35c9db' }))
    sprites.push({
      name: `ring-${name}`,
      viewBox: '0 0 96 96',
      size: 192,
      content: `<circle cx="48" cy="48" r="32" fill="none" stroke="${name === 'pink' ? '#faffff' : color}" stroke-width="${name === 'pink' ? 2 : 1.5}" style="filter:drop-shadow(0 0 3px ${color}) drop-shadow(0 0 3px ${color})"/>`,
    });
  for (const { name, size, viewBox, content } of sprites) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${content}</svg>`;
    const data = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { svg, size },
    );
    await writeFile(new URL(`${name}.png`, output), Buffer.from(data, 'base64'));
  }
  const urls = Object.fromEntries(
    await Promise.all(
      sprites.map(async ({ name }) => [
        name,
        `data:image/png;base64,${(await readFile(new URL(`${name}.png`, output))).toString('base64')}`,
      ]),
    ),
  );
  const atlases = await page.evaluate(async (urls) => {
    const textures = new Map(
      await Promise.all(
        Object.entries(urls).map(async ([name, url]) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          return [name, image];
        }),
      ),
    );
    const result = {};
    for (const icon of ['heart', 'star', 'sparkles']) {
      const atlas = document.createElement('canvas');
      atlas.width = 3200;
      atlas.height = 770;
      const ctx = atlas.getContext('2d');
      for (let frame = 0; frame < 50; frame++) {
        const p = frame / 50,
          ease = 1 - (1 - p) ** 3,
          fade = (1 - p) ** 1.5;
        ctx.save();
        ctx.beginPath();
        ctx.rect((frame % 10) * 320, Math.floor(frame / 10) * 154, 320, 154);
        ctx.clip();
        ctx.translate((frame % 10) * 320 + 160, Math.floor(frame / 10) * 154 + 77);
        ctx.scale(64, 64);
        const sprite = (name, x, y, w, h, angle = 0, opacity = fade) => {
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.drawImage(textures.get(name), -w / 2, -h / 2, w, h);
          ctx.restore();
        };
        const flare = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.3);
        flare.addColorStop(0, '#fff');
        flare.addColorStop(0.12, '#faffffe0');
        flare.addColorStop(0.35, '#f64e9360');
        flare.addColorStop(1, '#f64e9300');
        ctx.save();
        ctx.scale(1.2 + ease, 0.16);
        ctx.fillStyle = flare;
        ctx.globalAlpha = fade;
        ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
        ctx.restore();
        for (const ring of [0, 1])
          sprite(
            `ring-${ring ? 'cyan' : 'pink'}`,
            0,
            0,
            (0.7 + ease * (ring ? 1.6 : 1.1)) * 1.5,
            (0.55 + ease * 0.45) * 1.5,
            ((ring ? -1 : 1) * Math.PI) / 10,
            fade * (ring ? 0.65 : 1),
          );
        for (let i = 0; i < 14; i++) {
          const angle = (i / 14) * Math.PI * 2,
            distance = 0.3 + ease * (i % 2 ? 1.9 : 1.4),
            size = 0.5 * (1 - p * 0.5);
          sprite(
            `${i % 3 === 0 ? 'star' : 'streak'}-${['white', 'pink', 'cyan', 'white'][i % 4]}`,
            Math.cos(angle) * distance,
            Math.sin(angle) * (0.12 + ease * 0.4),
            size,
            size,
            angle + (ease * Math.PI) / 2,
          );
        }
        sprite(
          icon,
          0,
          0,
          (1 + ease * 0.65) * 1.76,
          (1 + ease * 0.65) * 1.76,
          (-ease * 16 * Math.PI) / 180,
        );
        ctx.restore();
      }
      result[icon] = atlas.toDataURL('image/png').split(',')[1];
    }
    return result;
  }, urls);
  for (const [icon, data] of Object.entries(atlases))
    await writeFile(new URL(`burst-${icon}.png`, output), Buffer.from(data, 'base64'));
  console.log(`Baked ${sprites.length} SPECIAL textures and 3 burst atlases.`);
} finally {
  await browser.close();
}
