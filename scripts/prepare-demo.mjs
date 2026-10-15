import { readdir, mkdir, stat, link, copyFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
async function videos(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await videos(full)));
    else if (/\.mp4$/i.test(entry.name)) found.push(full);
  }
  return found.sort();
}
await mkdir(path.join(root, 'public'), { recursive: true });
const source = (await videos(path.join(root, 'maps')))[0];
const target = path.join(root, 'public', 'demo.mp4');
const sourceStat = source ? await stat(source) : null;
if (source) {
  const targetStat = await stat(target).catch(() => null);
  if (
    !targetStat ||
    targetStat.size !== sourceStat.size ||
    targetStat.mtimeMs !== sourceStat.mtimeMs
  ) {
    if (targetStat) await unlink(target);
    await link(source, target).catch(() => copyFile(source, target));
  }
}
await writeFile(
  path.join(root, 'public', 'demo-media.json'),
  JSON.stringify({
    available: Boolean(source),
    fileName: source ? path.basename(source) : '',
    size: sourceStat?.size,
    lastModified: sourceStat?.mtimeMs,
    url: '/demo.mp4',
  }),
);
console.log(
  source
    ? 'Local demo video ready (media stays outside Git).'
    : 'No local demo video. Import any MP4 in the app.',
);
