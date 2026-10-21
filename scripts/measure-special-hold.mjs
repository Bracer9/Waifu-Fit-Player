import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// Run before and after a rendering change against the same dev server, with other
// browser tests stopped. Records three real 1080p runs without screenshot tracing.
const name = process.argv[2] || 'special-hold-profile';
const runs = [];
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.addInitScript(() =>
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }),
    );
    await page.goto(process.env.PROFILE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: /创作模式/ }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await (await chooser).setFiles('tests/fixtures/player/demo.mp4');
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
    const chart = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    chart.title = 'SPECIAL HOLD LOAD CHECK';
    chart.tempoSegments = [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' }];
    chart.notes = ['squat', 'calf_raise', 'punch', 'step', 'side_crunch'].map((lane, i) => ({
      id: lane,
      lane,
      direction: i < 2 ? 'up' : 'left',
      kind: 'hold',
      modifier: i % 2 ? 'sway' : 'none',
      timeMs: 2000,
      endTimeMs: 20000,
    }));
    chart.specialMove = { name: 'HEART POSE', icon: 'heart', previewBeats: 4 };
    chart.specialEvents = [
      { id: 'long', timeMs: 4000, endTimeMs: 14500 },
      { id: 'overlap', timeMs: 10500, endTimeMs: 17500 },
      { id: 'short', timeMs: 16500, endTimeMs: 16700 },
    ];
    await page.getByLabel('导入谱面文件').setInputFiles({
      name: 'hold-load.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(chart)),
    });
    await page.getByRole('button', { name: '跟练模式', exact: true }).click();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const beforeCpu = await cdp.send('Performance.getMetrics');
    const data = await page.evaluate(async () => {
      const v = document.querySelector('video');
      const samples = [];
      const longTasks = [];
      const observer = new PerformanceObserver((list) =>
        longTasks.push(...list.getEntries().map((e) => e.duration)),
      );
      observer.observe({ type: 'longtask' });
      let presented;
      let raf;
      let vf;
      let last = 0;
      let before = v.getVideoPlaybackQuality();
      const videoFrame = (_, meta) => {
        presented = meta.mediaTime;
        vf = v.requestVideoFrameCallback(videoFrame);
      };
      vf = v.requestVideoFrameCallback(videoFrame);
      await v.play();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Video did not reach 18.5 seconds.')),
          30000,
        );
        const tick = (now) => {
          if (v.currentTime < 3) before = v.getVideoPlaybackQuality();
          else if (last && presented !== undefined)
            samples.push({
              time: v.currentTime,
              delta: now - last,
              videoLag: (v.currentTime - presented) * 1000,
              renderLag: v.currentTime * 1000 - Number(document.querySelector('.seek').value),
              nodes: document.querySelectorAll('.special-lane-effect *').length,
            });
          last = now;
          if (v.currentTime >= 18.5) {
            clearTimeout(timeout);
            resolve();
          } else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
      v.pause();
      cancelAnimationFrame(raf);
      v.cancelVideoFrameCallback(vf);
      observer.disconnect();
      const after = v.getVideoPlaybackQuality();
      return {
        samples,
        longTasks,
        frames: after.totalVideoFrames - before.totalVideoFrames,
        dropped: after.droppedVideoFrames - before.droppedVideoFrames,
      };
    });
    const afterCpu = await cdp.send('Performance.getMetrics');
    const metrics = Object.fromEntries(
      afterCpu.metrics
        .filter((m) => /Duration$/.test(m.name))
        .map((m) => [
          m.name,
          (m.value - beforeCpu.metrics.find((p) => p.name === m.name).value) * 1000,
        ]),
    );
    const p95 = (a) => a.sort((a, b) => a - b)[Math.floor(a.length * 0.95)];
    const summary = {
      run,
      frames: data.frames,
      dropped: data.dropped,
      dropPercent: (data.dropped / data.frames) * 100,
      rafP95: p95(data.samples.map((s) => s.delta)),
      videoLagP95: p95(data.samples.map((s) => s.videoLag)),
      renderLagP95: p95(data.samples.map((s) => s.renderLag)),
      maxNodes: Math.max(...data.samples.map((s) => s.nodes)),
      steadyNodes: data.samples.find((s) => s.time > 9)?.nodes,
      longTasks: data.longTasks,
      cpu: metrics,
    };
    console.log(JSON.stringify(summary));
    runs.push({ summary, ...data });
    await writeFile(`artifacts/${name}.json`, JSON.stringify(runs, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
}
