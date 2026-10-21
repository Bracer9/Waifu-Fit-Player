import { openDemo, editInStudio } from './helpers/project';
import { expect, test } from '@playwright/test';

test('editor tool shortcuts respect inputs; day/night remains local to the editor', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }),
  );
  await page.goto('/');
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const gamePaint = () =>
    page.locator('.practice').evaluate((root) =>
      ['.practice', '.stage-left', '.stage-right', '.play-lane', '.lane-label', '.transport'].map(
        (selector) => {
          const style = getComputedStyle(
            selector === '.practice' ? root : root.querySelector(selector)!,
          );
          return [style.backgroundColor, style.backgroundImage, style.color, style.borderColor];
        },
      ),
    );
  const originalGamePaint = await gamePaint();
  await editInStudio(page);
  const select = page.getByRole('button', { name: '选择工具', exact: true });
  const draw = page.getByRole('button', { name: '绘制工具', exact: true });
  await page.keyboard.press('s');
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  const title = page.getByRole('textbox', { name: '作品名称', exact: true });
  const originalTitle = await title.inputValue();
  await title.fill('');
  await title.pressSequentially('se');
  await expect(title).toHaveValue('se');
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await title.fill(originalTitle);
  await title.press('Enter');
  const snap = page.getByLabel('吸附', { exact: true });
  await snap.focus();
  await snap.press('e');
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await snap.blur();
  await page.keyboard.press('e');
  await expect(draw).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toContainText('草稿已保存');
  await expect(draw).toHaveAttribute('aria-pressed', 'true');

  const theme = page.getByRole('button', { name: '切换日夜主题', exact: true });
  await theme.click();
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.app')).toHaveAttribute('data-workbench-theme', 'dark');
  await page.screenshot({ path: 'artifacts/workbench-editor-night.png', fullPage: true });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.locator('.app')).not.toHaveAttribute('data-workbench-theme');
  expect(await gamePaint()).toEqual(originalGamePaint);
  await editInStudio(page);
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '返回主页', exact: true }).click();
  await expect(page.locator('.app')).not.toHaveAttribute('data-workbench-theme');
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await theme.click();
  await expect(page.locator('.app')).not.toHaveAttribute('data-workbench-theme');
  expect(errors).toEqual([]);
});
