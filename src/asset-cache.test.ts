import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('document', {
    baseURI: 'http://localhost/',
    fonts: { load: vi.fn().mockResolvedValue([]) },
  });
});
afterEach(() => vi.unstubAllGlobals());

it('不同页面共享正在解码的图片，完成前不报告就绪，完成后复用', async () => {
  let finish!: () => void;
  const decode = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = decode;
    },
  );
  const { prepareAssets } = await import('./asset-cache');
  const progress = vi.fn();
  const first = prepareAssets({ images: ['/shared.png', '/shared.png'] }, progress);
  const second = prepareAssets({ images: ['http://localhost/shared.png'] });
  expect(decode).toHaveBeenCalledTimes(1);
  expect(progress).toHaveBeenLastCalledWith(0, 1);
  finish();
  await Promise.all([first, second]);
  expect(progress).toHaveBeenLastCalledWith(1, 1);
  await prepareAssets({ images: ['/shared.png'] });
  expect(decode).toHaveBeenCalledTimes(1);
});

it('失败图片可重试，已成功的图片和字体无需再次准备', async () => {
  const decode = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = decode;
    },
  );
  const { prepareAssets } = await import('./asset-cache');
  const manifest = { images: ['/retry.png'], fonts: ['700 16px Test'] };
  await expect(prepareAssets(manifest)).rejects.toThrow('图片资源');
  await prepareAssets(manifest);
  await prepareAssets(manifest);
  expect(decode).toHaveBeenCalledTimes(2);
  expect(document.fonts.load).toHaveBeenCalledTimes(1);
});
