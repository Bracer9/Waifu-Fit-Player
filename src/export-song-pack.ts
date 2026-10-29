import type { Song } from './library';

/** The local program writes the complete ZIP to exports; no media passes through this page. */
export async function exportSongPackLocally(
  selection: Song | Song[],
  progress?: (value: number) => void,
) {
  const songs = Array.isArray(selection) ? selection : [selection];
  if (!songs.length) throw new Error('请先选择要导出的曲目。');
  const response = await fetch('/__wfp/export-packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WFP-Workspace': '1' },
    body: JSON.stringify({
      songIds: [...new Set(songs.map((song) => song.id))],
      single: !Array.isArray(selection),
    }),
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('本地程序尚未支持新版导出，请重新启动 start-demo。');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '无法准备曲包。');
  if (typeof result.jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(result.jobId))
    throw new Error('导出任务无效。');
  for (;;) {
    const status = await fetch(`/__wfp/export-packs/${result.jobId}`, { cache: 'no-store' });
    const job = await status.json();
    if (!status.ok || job.state === 'error') throw new Error(job.error || '曲包导出失败。');
    progress?.(job.progress);
    if (job.state === 'done' && typeof job.path === 'string') return job.path as string;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}
