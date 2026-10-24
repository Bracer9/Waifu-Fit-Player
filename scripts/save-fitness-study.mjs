// Saves a review draft only after an isolated workspace proves that all
// existing authored/generated chart bytes and the active draft stay intact.
import { build } from 'esbuild';
import { readFile, writeFile, readdir, mkdir, cp, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
const out = path.resolve(
  process.env.WFP_FITNESS_STUDY_DIR ?? 'artifacts/fitness-retrain-2026-10-24',
);
const config = process.env.WFP_FITNESS_STUDY_DIR
  ? JSON.parse(await readFile(path.join(out, 'review-input.json'), 'utf8'))
  : {};
const folder = config.folder ?? '愛スクリ～ム',
  name = config.name ?? 'AI重学 v3（待审）';
await build({
  entryPoints: ['scripts/maps-workspace.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(out, 'maps-workspace-study.mjs'),
});
const { MapsWorkspace } = await import(
  pathToFileURL(path.join(out, 'maps-workspace-study.mjs')).href
);
const candidateBytes = await readFile(path.join(out, config.candidate ?? 'phrase-training-3.json'));
const generated = JSON.parse(candidateBytes.toString('utf8')).chart;
const source = path.resolve('maps', folder),
  labRoot = path.join(out, 'review-maps'),
  lab = path.join(labRoot, folder);
const realWorkspace = new MapsWorkspace(path.resolve('maps'));
const real = await realWorkspace.readProject(folder);
if (
  generated.songId !== real.song.id ||
  generated.chartType !== 'fitness' ||
  generated.videoHint.assetId !== real.song.drafts.fitness.chart.videoHint.assetId
)
  throw Error('Target song/type/media mismatch');
const originalNames = (await readdir(source)).filter((f) => f.endsWith('.json'));
const original = Object.fromEntries(
  await Promise.all(originalNames.map(async (f) => [f, await readFile(path.join(source, f))])),
);
await mkdir(labRoot, { recursive: true });
if (!process.argv.includes('--install'))
  await cp(source, lab, { recursive: true, errorOnExist: false });
const workspace = new MapsWorkspace(labRoot),
  current = await workspace.readProject(folder);
const old = current.song.namedDrafts?.find((d) => d.name === name),
  id = old?.id ?? randomUUID();
const append = (song) => ({
  ...song,
  namedDrafts: [
    ...(song.namedDrafts ?? []).filter((d) => d.id !== id),
    {
      id,
      name,
      chartType: 'fitness',
      chart: generated,
      cover: song.drafts.fitness.cover,
      albumId: song.drafts.fitness.albumId,
      updatedAt: Date.now(),
    },
  ],
});
// Browser review can legitimately change the isolated working slot. The real
// save must preserve the user's current working/released slots and selection.
const check = await workspace.saveSong(
  append({
    ...current.song,
    drafts: real.song.drafts,
    released: real.song.released,
    activeDrafts: real.song.activeDrafts,
  }),
  current.location.revision,
  folder,
);
for (const f of originalNames)
  if (f !== 'project.json' && !f.includes(id)) {
    if (!(await readFile(path.join(lab, f))).equals(original[f]))
      throw Error('Preflight would change existing chart: ' + f);
  }
if (JSON.stringify(check.song.activeDrafts) !== JSON.stringify(real.song.activeDrafts))
  throw Error('Preflight would switch active user draft');
if (check.song.namedDrafts.find((d) => d.id === id)?.chart.notes.length !== generated.notes.length)
  throw Error('Review draft did not persist');
await writeFile(
  path.join(out, 'preflight-save.json'),
  JSON.stringify(
    {
      name,
      id,
      folder,
      notes: generated.notes.length,
      existingChartBytesUnchanged: true,
      activeDraftUnchanged: true,
      labRoot,
    },
    null,
    2,
  ),
);
console.log('Isolated preflight saved: ' + name + ' / ' + generated.notes.length + ' notes.');
if (!process.argv.includes('--install')) process.exit(0);
// A successful browser review must precede installation into the user's maps.
const review = JSON.parse(await readFile(path.join(out, 'browser-review.json'), 'utf8'));
if (
  review.id !== id ||
  review.name !== name ||
  review.notes !== generated.notes.length ||
  !review.playable
)
  throw Error('Matching playable browser review required');
if (
  process.env.WFP_FITNESS_STUDY_DIR &&
  review.candidateSha256 !== createHash('sha256').update(candidateBytes).digest('hex')
)
  throw Error('Candidate changed since browser review; review it again before installation');
const fresh = await realWorkspace.readProject(folder);
if (fresh.location.revision !== real.location.revision)
  throw Error('User project changed during preflight; not saved');
const backup = path.join(out, 'before-install');
await mkdir(backup, { recursive: true });
for (const f of originalNames) await copyFile(path.join(source, f), path.join(backup, f));
const saved = await realWorkspace.saveSong(append(fresh.song), fresh.location.revision, folder);
for (const f of originalNames)
  if (f !== 'project.json' && !f.includes(id)) {
    if (!(await readFile(path.join(source, f))).equals(original[f]))
      throw Error('Unexpected existing chart change: ' + f);
  }
if (JSON.stringify(saved.song.activeDrafts) !== JSON.stringify(real.song.activeDrafts))
  throw Error('Active user draft changed');
const file = `wfp-fitness-draft-${id}.json`;
await writeFile(
  path.join(out, 'installed-study.json'),
  JSON.stringify(
    {
      name,
      id,
      file: path.join(source, file),
      notes: generated.notes.length,
      sha256: createHash('sha256')
        .update(await readFile(path.join(source, file)))
        .digest('hex'),
      backup,
      existingChartsUnchanged: true,
      activeUserDraftUnchanged: true,
      revision: saved.location.revision,
    },
    null,
    2,
  ),
);
console.log('Installed independent review draft: ' + file);
