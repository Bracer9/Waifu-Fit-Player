import { editInStudio } from './helpers/project';
import { test, expect, exportChart, draw } from './helpers/editor';
import { TEST_VIDEO } from './helpers/test-media';

test('实际本地 MP4 导入，新建第二首与全屏保留工作区', async ({ page }) => {
  await page.getByRole('button', { name: /创作模式/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles(TEST_VIDEO);
  await expect(page.getByRole('heading', { name: 'demo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await draw(page, 2000, 'step');
  const chart = await exportChart(page);
  expect(chart.notes).toHaveLength(1);
  expect(chart.videoHint.fileName).toBe('demo.mp4');
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  await expect(page.getByLabel('Movement tracks')).toBeVisible();
  await expect(page.getByLabel('Video', { exact: true })).toBeVisible();

  await editInStudio(page);
  const secondChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await secondChooser).setFiles(TEST_VIDEO);
  await expect(page.getByTestId('editor-note')).toHaveCount(0);
  expect((await exportChart(page)).notes).toHaveLength(0);
});
