import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoverTrace } from '../src/components/CoverTrace';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');

test('wide album borders render equal cyan and pink trail lengths throughout an orbit', async ({
  page,
}) => {
  await page.setContent(
    `<style>${readFileSync('src/menu.css', 'utf8')}</style><div class="collection-album" data-highlighted style="position:relative;width:800px;height:300px;background:#1d1c21;margin:0;padding:0;transform:none">${renderToStaticMarkup(createElement(CoverTrace, { pixelUnits: true }))}</div>`,
  );
  const trace = page.locator('.cover-trace');
  for (const time of [0, 225, 450, 675, 900, 1125, 1350, 1575]) {
    await trace.locator('rect').evaluateAll((nodes, time) => {
      for (const node of nodes) {
        const animation = node.getAnimations()[0];
        animation.pause();
        animation.currentTime = time;
      }
    }, time);
    const png = PNG.sync.read(await trace.screenshot());
    let cyan = 0,
      pink = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const [r, g, b] = png.data.subarray(i, i + 3);
      if (r < 60 && g > 140 && b > 210) cyan++;
      if (r > 210 && g < 70 && b > 70 && b < 190) pink++;
    }
    expect(cyan).toBeGreaterThan(100);
    expect(pink / cyan, `pink/cyan at ${time}ms`).toBeGreaterThan(0.95);
    expect(pink / cyan, `pink/cyan at ${time}ms`).toBeLessThan(1.05);
  }
  await trace.screenshot({ path: 'artifacts/cover-trace-balanced.png' });
});
