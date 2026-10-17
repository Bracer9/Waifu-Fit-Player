export type AssetManifest = { images: string[]; fonts?: string[] };

// Share both in-flight work and decoded results across screens. Rejected jobs
// are removed so retrying never treats a failed request as a cached success.
const jobs = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = jobs.get(key);
  if (existing) return existing as Promise<T>;
  const job = load().catch((error) => {
    jobs.delete(key);
    throw error;
  });
  jobs.set(key, job);
  return job;
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('资源读取超时，请重试。')), 15000);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export async function prepareAssets(
  manifest: AssetManifest,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<void> {
  const images = [...new Set(manifest.images)];
  const fonts = [...new Set(manifest.fonts ?? [])];
  const total = images.length + fonts.length;
  let done = 0;
  onProgress(0, total);
  const tasks = [
    ...images.map((path) => {
      const url = new URL(path, document.baseURI).href;
      return cached(`image:${url}`, async () => {
        const image = new Image();
        image.src = url;
        try {
          await withTimeout(image.decode());
        } catch {
          throw new Error('图片资源未能加载，请重试。');
        }
        return image;
      });
    }),
    ...fonts.map((font) => cached(`font:${font}`, () => withTimeout(document.fonts.load(font)))),
  ];
  await Promise.all(tasks.map((task) => task.then(() => onProgress(++done, total))));
}
