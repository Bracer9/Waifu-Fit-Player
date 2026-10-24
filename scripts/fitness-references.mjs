// Explicitly approved human sources only. Never infer training provenance from
// the current draft slot: that slot can contain our own generated output.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const humanSources = [
  { folder: 'Happy Halloween', file: 'wfp-fitness-draft.json' },
  { folder: 'LOVELY ♥ CAVITY-7c74302b', file: 'wfp-fitness-draft.json' },
  { folder: 'sugar ★ mellowcle-7eb2c6ba', file: 'wfp-fitness-draft.json' },
  { folder: '愛スクリ～ム', name: '人工版本' },
];
export async function readHumanReferences() {
  return Promise.all(
    humanSources.map(async (source) => {
      const folder = path.join('maps', source.folder);
      const manifest = JSON.parse(await readFile(path.join(folder, 'project.json'), 'utf8'));
      const entry = source.name
        ? manifest.namedDrafts?.find((d) => d.name === source.name && d.chartType === 'fitness')
        : manifest.drafts.fitness;
      if (!entry) throw new Error(`Missing approved human draft: ${source.folder}/${source.name}`);
      const file = path.join(folder, source.name ? entry.file : source.file).replaceAll('\\', '/');
      const bytes = await readFile(file);
      const chart = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      if (
        chart.chartType !== 'fitness' ||
        chart.tempoSegments.length !== 1 ||
        chart.tempoSegments[0].meter !== '4/4'
      )
        throw new Error(`Reference needs a constant 4/4 Fitness grid: ${file}`);
      const media =
        manifest.media.find(
          (m) => m.id === chart.videoHint.assetId || m.aliases?.includes(chart.videoHint.assetId),
        ) ?? manifest.media[0];
      return {
        source,
        file,
        chart,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        video: path.join(folder, media.file),
      };
    }),
  );
}
