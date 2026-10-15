import type { Chart } from './model';

export type VideoFileHandle = FileSystemFileHandle & {
  queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
};
export type VideoAsset =
  | { id: string; kind: 'file'; file: File; handle?: VideoFileHandle }
  | { id: string; kind: 'demo'; fileName: string; url: string };
export type StoredVideo = {
  id: string;
  fileName: string;
  size: number;
  lastModified: number;
  handle?: VideoFileHandle;
  file?: File;
};
export type VideoResolution = { asset: VideoAsset } | { reason: string; permission?: StoredVideo };
export type PreparedVideo = {
  hint: Chart['videoHint'];
  src: string;
  ownedUrl: boolean;
};
type PickerWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<VideoFileHandle[]>;
};

export function videoPicker() {
  const picker = (window as PickerWindow).showOpenFilePicker;
  return picker
    ? () =>
        picker.call(window, {
          id: 'wfp-video',
          multiple: false,
          types: [{ description: '舞蹈视频 MP4', accept: { 'video/mp4': ['.mp4'] } }],
          excludeAcceptAllOption: true,
        })
    : null;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('waifu-fit-player-media', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('videos', { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () =>
      reject(new Error('视频关联存储正被其他窗口占用，请关闭旧版窗口后重试。'));
  });
}

async function storedVideo(id: string, value?: StoredVideo): Promise<StoredVideo | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('videos', value ? 'readwrite' : 'readonly');
    const store = tx.objectStore('videos');
    let request: IDBRequest;
    try {
      request = value ? store.put(value) : store.get(id);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(value || request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('无法保存本地视频关联。'));
    };
  });
}

export async function rememberVideo(asset: VideoAsset): Promise<void> {
  if (asset.kind === 'demo') return;
  const { file, handle, id } = asset;
  try {
    await storedVideo(id, {
      id,
      fileName: file.name,
      size: file.size,
      lastModified: file.lastModified,
      ...(handle ? { handle } : { file }),
    });
  } catch (error) {
    throw new Error(
      `无法记住视频，作品尚未切换。请检查浏览器本地存储空间或权限。${error instanceof Error ? `（${error.message}）` : ''}`,
    );
  }
}

export async function readStoredVideo(record: StoredVideo): Promise<VideoResolution> {
  try {
    if (
      record.handle?.queryPermission &&
      (await record.handle.queryPermission({ mode: 'read' })) !== 'granted'
    )
      return { reason: '已记住视频的位置，请重新允许读取此视频。', permission: record };
    const file = record.handle ? await record.handle.getFile() : record.file;
    if (!file) return { reason: '视频关联已失效，请重新定位视频。' };
    if (file.size !== record.size || file.lastModified !== record.lastModified)
      return { reason: '原视频已被修改，请重新选择并确认使用的视频。' };
    return { asset: { id: record.id, kind: 'file', file, handle: record.handle } };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError')
      return { reason: '请重新允许读取已关联的视频。', permission: record };
    return { reason: '原视频无法读取，可能已被移动或删除，请重新定位。' };
  }
}

export async function demoVideo(): Promise<VideoAsset> {
  const response = await fetch('/demo-media.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('没有找到示例素材。请运行启动脚本，或新建作品选择 MP4。');
  const meta = await response.json();
  if (!meta.available || typeof meta.fileName !== 'string')
    throw new Error('本地没有示例视频，请新建作品选择 MP4。');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([meta.fileName, meta.size, meta.lastModified])),
  );
  const id =
    'demo-' + Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
  // JSON charts cannot supply a URL or an arbitrary filesystem path to fetch.
  return { id, kind: 'demo', fileName: meta.fileName, url: '/demo.mp4' };
}

export async function resolveVideo(assetId?: string): Promise<VideoResolution> {
  if (!assetId)
    return { reason: '这份旧作品还没有保存视频关联。选择一次对应视频，保存后即可自动打开。' };
  if (assetId.startsWith('demo-')) {
    try {
      const asset = await demoVideo();
      return asset.id === assetId
        ? { asset }
        : { reason: '示例素材已经变化，请重新定位作品的视频。' };
    } catch {
      return { reason: '这份作品的示例视频不在当前目录，请重新定位视频。' };
    }
  }
  const record = await storedVideo(assetId);
  return record
    ? readStoredVideo(record)
    : { reason: '当前浏览器没有此作品的视频关联，请重新定位一次视频。' };
}

/** Probe before replacing the current project: failures and cancelled pickers leave it intact. */
export async function prepareVideo(asset: VideoAsset): Promise<PreparedVideo> {
  if (asset.kind === 'file' && !/\.mp4$/i.test(asset.file.name) && asset.file.type !== 'video/mp4')
    throw new Error('请选择 MP4 视频文件。');
  const ownedUrl = asset.kind === 'file';
  const src = asset.kind === 'file' ? URL.createObjectURL(asset.file) : asset.url;
  try {
    const durationMs = await new Promise<number>((resolve, reject) => {
      const probe = document.createElement('video');
      const cleanup = () => {
        clearTimeout(timer);
        probe.onloadedmetadata = probe.onerror = null;
        probe.removeAttribute('src');
        probe.load();
      };
      const fail = (message: string) => {
        cleanup();
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail('读取视频超时，请确认文件可用后重试。'), 15000);
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        const duration = Math.round(probe.duration * 1000);
        if (!Number.isFinite(duration) || duration <= 0 || !probe.videoWidth) {
          fail('这个文件没有可播放的视频画面。');
          return;
        }
        cleanup();
        resolve(duration);
      };
      probe.onerror = () => fail('视频无法播放，请选择兼容的 MP4（H.264 + AAC）。');
      probe.src = src;
    });
    return {
      src,
      ownedUrl,
      hint: {
        assetId: asset.id,
        fileName: asset.kind === 'file' ? asset.file.name : asset.fileName,
        durationMs,
      },
    };
  } catch (error) {
    if (ownedUrl) URL.revokeObjectURL(src);
    throw error;
  }
}

export function releaseVideo(video: PreparedVideo) {
  if (video.ownedUrl) URL.revokeObjectURL(video.src);
}
