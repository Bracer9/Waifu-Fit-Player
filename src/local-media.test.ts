import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStoredVideo, type StoredVideo, type VideoFileHandle } from './local-media';
import { blankChart, parseChart, serializeChart } from './model';

const id = 'b6a28387-2bc3-4f41-a53d-62d197be272b';
const file = new File(['mp4'], 'dance.mp4', { type: 'video/mp4', lastModified: 100 });
const base: StoredVideo = {
  id,
  fileName: file.name,
  size: file.size,
  lastModified: file.lastModified,
};
const handle = (methods: Record<string, unknown>) => methods as unknown as VideoFileHandle;
afterEach(() => vi.unstubAllGlobals());

describe('作品的视频关联', () => {
  it('关联随 JSON 往返，旧谱仍可读，拒绝将 URL 当关联 ID', () => {
    const chart = blankChart();
    expect(parseChart(chart).videoHint.assetId).toBeUndefined();
    chart.videoHint.assetId = id;
    expect(parseChart(JSON.parse(serializeChart(chart))).videoHint.assetId).toBe(id);
    chart.videoHint.assetId = 'https://example.org/video.mp4';
    expect(() => parseChart(chart)).toThrow('视频关联 ID 无效');
  });
  it('需要权限时只返回授权请求，不自动请求权限或读取文件', async () => {
    const getFile = vi.fn(),
      requestPermission = vi.fn();
    const record = {
      ...base,
      handle: handle({ queryPermission: async () => 'prompt', getFile, requestPermission }),
    };
    expect(await readStoredVideo(record)).toMatchObject({ permission: record });
    expect(getFile).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('已授权引用可直接读出对应文件', async () => {
    const result = await readStoredVideo({
      ...base,
      handle: handle({ queryPermission: async () => 'granted', getFile: async () => file }),
    });
    expect(result).toMatchObject({ asset: { id, kind: 'file', file } });
  });
  it('区分失去权限、文件丢失与文件变动', async () => {
    const result = (name: string) =>
      readStoredVideo({
        ...base,
        handle: handle({
          getFile: async () => {
            throw new DOMException('failed', name);
          },
        }),
      });
    expect(await result('NotAllowedError')).toHaveProperty('permission');
    expect(await result('NotFoundError')).toMatchObject({
      reason: expect.stringContaining('移动或删除'),
    });
    expect(
      await readStoredVideo({ ...base, file: new File(['changed'], file.name) }),
    ).toMatchObject({ reason: expect.stringContaining('已被修改') });
  });
  it('兼容文件缓存无需重新选择，缺失记录不伪装成成功', async () => {
    expect(await readStoredVideo({ ...base, file })).toMatchObject({ asset: { id, file } });
    expect(await readStoredVideo(base)).toHaveProperty('reason');
  });
  it('文件改名后使用 maps 唯一元数据匹配，保持原关联 ID', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fileName: 'renamed.mp4', url: '/__wfp/map-file/song/renamed.mp4' }),
    });
    vi.stubGlobal('fetch', fetcher);
    const record = {
      ...base,
      handle: handle({
        getFile: async () => {
          throw new DOMException('gone', 'NotFoundError');
        },
      }),
    };
    expect(await readStoredVideo(record)).toEqual({
      asset: { id, kind: 'pack', fileName: 'renamed.mp4', url: '/__wfp/map-file/song/renamed.mp4' },
    });
    expect(fetcher).toHaveBeenCalledWith('/__wfp/find-video?size=3&lastModified=100', {
      cache: 'no-store',
    });
    // Missing/ambiguous matches, static hosting, and failed requests still allow manual relocation.
    fetcher.mockResolvedValue({ ok: false });
    expect(await readStoredVideo(record)).toHaveProperty('reason');
    fetcher.mockRejectedValue(new Error('offline'));
    expect(await readStoredVideo(record)).toHaveProperty('reason');
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({ fileName: 'x.mp4', url: 'https://example.com/x.mp4' }),
    });
    expect(await readStoredVideo(record)).toHaveProperty('reason');
  });
  it('权限不足或视频已修改时不自动改用 maps 中的文件', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await readStoredVideo({
      ...base,
      handle: handle({
        getFile: async () => {
          throw new DOMException('denied', 'NotAllowedError');
        },
      }),
    });
    await readStoredVideo({
      ...base,
      file: new File(['changed'], 'dance.mp4', { lastModified: 100 }),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
