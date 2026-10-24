// Reads approved human charts and their actual audio, never writes maps.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { readHumanReferences } from './fitness-references.mjs';
const load = async (file) =>
  import(
    'data:text/javascript;base64,' +
      Buffer.from(
        (await build({ entryPoints: [file], bundle: true, write: false, format: 'esm' }))
          .outputFiles[0].text,
      ).toString('base64')
  );
const { BpmEnvelope } = await load('src/bpm.ts');
const { MusicSpectrum } = await load('src/fitness/spectrum.ts');
const { musicContext } = await load('src/fitness/context.ts');
const { fitContext, matchMovement } = await load('src/fitness/learning.ts');
const { movementModes } = await load('src/fitness/movement.ts');
const refs = await readHumanReferences();
const warehouse = JSON.parse(await readFile('src/fitness/bricks-study.json', 'utf8'));
const examples = [],
  audio = [];
const out = 'artifacts/fitness-retrain-2026-10-24';
await mkdir(out, { recursive: true });
const structure = JSON.parse(
  await readFile('docs/fitness/STRUCTURE-STUDY-2026-10-24.json', 'utf8'),
);
function structureFeatures(song, startMs, endMs) {
  const sections = structure.results.find((r) => r.song === song).sections;
  const labels = ['intro', 'verse', 'chorus', 'inst', 'bridge', 'outro', 'silence'];
  return labels.map(
    (label) =>
      sections
        .filter((s) => s.label === label)
        .reduce(
          (sum, s) => sum + Math.max(0, Math.min(endMs, s.endMs) - Math.max(startMs, s.startMs)),
          0,
        ) /
      (endMs - startMs),
  );
}
for (const ref of refs) {
  const result = spawnSync(
    process.env.WFP_FFMPEG ?? 'ffmpeg',
    ['-v', 'error', '-i', ref.video, '-vn', '-ar', '22050', '-ac', '2', '-f', 'f32le', 'pipe:1'],
    { maxBuffer: 100 * 1024 * 1024 },
  );
  if (result.status !== 0) throw Error(String(result.stderr) || 'ffmpeg unavailable');
  const samples = new Float32Array(
      result.stdout.buffer,
      result.stdout.byteOffset,
      result.stdout.byteLength / 4,
    ),
    duration = samples.length / 2 / 22050;
  const env = new BpmEnvelope(duration),
    spectral = new MusicSpectrum();
  for (let i = 0; i < samples.length; i += 8192) {
    const length = Math.min(4096, (samples.length - i) / 2),
      channels = Array.from({ length: 2 }, (_, c) =>
        Float32Array.from({ length }, (_, j) => samples[i + j * 2 + c]),
      );
    env.push(channels, 22050, i / 2 / 22050);
    spectral.push(channels, 22050, i / 2 / 22050);
  }
  const onsets = env.onsets(),
    levels = env.levels(),
    spectrum = spectral.data(),
    beatMs = 60000 / ref.chart.tempoSegments[0].bpm;
  audio.push({
    title: ref.chart.title,
    base: ref.chart,
    onsets: Array.from(onsets),
    levels: Array.from(levels),
    spectrum,
  });
  for (const brick of warehouse.bricks)
    for (const source of brick.sources.filter((s) => s.file === ref.file)) {
      const startMs = source.startMs - (ref.chart.videoOffsetMs ?? 0),
        endMs = source.endMs - (ref.chart.videoOffsetMs ?? 0);
      examples.push({
        song: ref.chart.title,
        brickId: brick.id,
        family: movementModes(brick.notes).join('+'),
        beats: brick.beats,
        startMs,
        endMs,
        values: [
          ...musicContext(onsets, levels, spectrum, startMs, endMs, beatMs, 200).values,
          ...structureFeatures(ref.chart.title, startMs, endMs).map((v) => v * 2),
        ],
      });
    }
  console.log(
    JSON.stringify({
      song: ref.chart.title,
      examples: examples.filter((e) => e.song === ref.chart.title).length,
      frames: spectrum.frames.length,
    }),
  );
}
const model = fitContext(examples);
const folds = [];
for (const ref of refs) {
  const training = examples.filter((e) => e.song !== ref.chart.title),
    testing = examples.filter((e) => e.song === ref.chart.title);
  const fold = fitContext(training),
    predictions = [];
  for (const e of testing) {
    const result = matchMovement({ values: e.values, spectral: true }, e.beats, fold);
    const guess = Object.entries(result.families).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    predictions.push({
      startMs: e.startMs,
      family: e.family,
      guess,
      confidence: result.confidence,
      correct: guess === e.family,
    });
  }
  const unique = predictions.filter(
    (p, i) => predictions.findIndex((x) => x.startMs === p.startMs && x.family === p.family) === i,
  );
  const perFamily = Object.fromEntries(
    [...new Set(unique.map((p) => p.family))].map((f) => {
      const rows = unique.filter((p) => p.family === f);
      return [f, { samples: rows.length, correct: rows.filter((p) => p.correct).length }];
    }),
  );
  folds.push({
    song: ref.chart.title,
    trainSongs: [...new Set(training.map((e) => e.song))],
    samples: unique.length,
    correct: unique.filter((p) => p.correct).length,
    accuracy: unique.filter((p) => p.correct).length / (unique.length || 1),
    perFamily,
    predictions: unique,
  });
}
await writeFile(`${out}/context-model.json`, JSON.stringify(model, null, 2) + '\n');
await writeFile(`${out}/audio-context.json`, JSON.stringify(audio));
const validation = {
  version: 1,
  method: 'leave-one-song-out; source windows overlap; descriptive, not independent clip accuracy',
  humanSources: refs.map((r) => ({ file: r.file, sha256: r.sha256 })),
  examples: examples.length,
  folds,
};
await writeFile(
  'docs/fitness/CONTEXT-VALIDATION-2026-10-24.json',
  JSON.stringify(validation, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    folds.map(({ song, samples, correct, accuracy }) => ({ song, samples, correct, accuracy })),
    null,
    2,
  ),
);
