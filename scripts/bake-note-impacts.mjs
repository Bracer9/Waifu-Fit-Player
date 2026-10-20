// Bake the existing DOM/CSS effect, not a redesigned approximation. All blur,
// shadow and particle drawing happens offline, as for crunch/SPECIAL sprites.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const output = new URL('../public/art/impact/', import.meta.url);
const css = (
  await Promise.all(
    ['styles.css', 'practice.css'].map((name) =>
      readFile(new URL(`../src/${name}`, import.meta.url), 'utf8'),
    ),
  )
).join('\n');
const palettes = {
  pink: 'pink',
  cyan: 'cyan',
  miku: 'miku',
  neutral: 'arms-any',
  both: 'arms-both',
};
const frames = 32,
  width = 256,
  height = 192;
function effect(p, release) {
  const ease = 1 - (1 - p) ** 3,
    fade = (1 - p) ** 1.35;
  const layer = (name, opacity, scale, body = '') =>
    `<div class="${name}" style="opacity:${opacity};transform:translate(-50%,-50%) scale(${scale})">${body}</div>`;
  return (
    `<div class="note-impact ${release ? 'release' : 'arrival'}">` +
    layer('impact-halo', fade * 0.95, 0.6 + ease * 0.9) +
    layer('impact-ring', 1 - p, 0.65 + ease * (release ? 1.1 : 0.9)) +
    layer(
      'impact-core',
      Math.max(0, 1 - p * 2.4),
      1.15 - ease * 0.55,
      `<span class="${release ? 'release-core' : 'impact-light'}"></span>`,
    ) +
    layer('impact-flare', Math.max(0, 1 - p * 2.8), 0.6 + ease * 0.8) +
    Array.from({ length: 8 }, (_, i) => {
      const angle = (i * Math.PI) / 4 + Math.PI / 8,
        distance = 20 + ease * (i % 2 ? 48 : 62);
      return `<i class="impact-particle ${i % 2 ? 'spark' : 'streak'}" style="opacity:${fade};transform:translate(-50%,-50%) translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance * 0.6}px) rotate(${(angle * 180) / Math.PI}deg) scale(${1 - p * 0.45})"></i>`;
    }).join('') +
    '</div>'
  );
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: width * 8, height: height * 8 },
    deviceScaleFactor: 1,
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const [name, variable] of Object.entries(palettes)) {
    if (process.argv[2] && process.argv[2] !== name) continue;
    const tiles = Array.from(
      { length: frames * 2 },
      (_, i) => `<div class="tile">${effect((i % frames) / (frames - 1), i >= frames)}</div>`,
    ).join('');
    await page.setContent(`<style>${css}
      :root,html,body{margin:0;padding:0;background:transparent!important;min-width:0}
      .atlas{display:grid;grid-template-columns:repeat(8,${width}px);width:${width * 8}px;
        --note-size:78px;--target-size:78px;--tail-size:45.24px;--lane:var(--${variable})}
      .tile{position:relative;width:${width}px;height:${height}px;overflow:hidden}
      .tile>.note-impact{left:50%;top:50%}
      </style><div class="atlas practice">${tiles}</div>`);
    await writeFile(
      new URL(`${name}.png`, output),
      await page.screenshot({ omitBackground: true }),
    );
    console.log(`Baked ${name}: ${frames} arrival + ${frames} release frames.`);
  }
} finally {
  await browser.close();
}
