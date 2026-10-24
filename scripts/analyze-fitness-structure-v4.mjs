// Local research only. No game import, maps mutation or shipping dependency.
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHumanReferences } from './fitness-references.mjs';
const out = 'artifacts/fitness-v4-2026-10-24';
const old = 'artifacts/fitness-retrain-2026-10-24';
const load = async (file) =>
  import(
    'data:text/javascript;base64,' +
      Buffer.from(
        (await build({ entryPoints: [file], bundle: true, write: false, format: 'esm' }))
          .outputFiles[0].text,
      ).toString('base64')
  );
const source = path.resolve(old, 'linkseg/src');
const bundled = await build({
  stdin: {
    contents: `export {buildLinkSegWindows} from './windows'; export {melForWindows} from './mel'; export {linksegDecode,LINKSEG_LABELS} from './decode';`,
    resolveDir: source,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
});
const { buildLinkSegWindows, melForWindows, linksegDecode, LINKSEG_LABELS } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
LINKSEG_LABELS[7] = 'pre-chorus';
LINKSEG_LABELS[8] = 'post-chorus';
const ort = await import(
  pathToFileURL(path.resolve(old, 'runtime/node_modules/onnxruntime-web/dist/ort.node.min.mjs'))
    .href
);
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(
  new Uint8Array(await readFile(`${out}/linkseg_9c.onnx`)),
  {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  },
);
const floats = async (name) => {
  const b = await readFile(`${out}/${name}.f32`);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const validation = await session.run(
  { mel: new ort.Tensor('float32', await floats('validation-mel'), [31, 1, 64, 64]) },
  ['bound', 'label', 'embedding'],
);
const errors = {};
for (const key of ['bound', 'label', 'embedding']) {
  const expected = await floats('validation-' + key),
    actual = validation[key].data;
  const error = Math.max(...actual.map((v, i) => Math.abs(v - expected[i])));
  if (error > 2e-4) throw Error(`ONNX ${key} mismatch: ${error}`);
  errors[key] = error;
}
await writeFile(`${out}/onnx-validation.json`, JSON.stringify({ frames: 31, errors }, null, 2));
console.log('Numerical ONNX validation:', JSON.stringify(errors));
const refs = await readHumanReferences();
const oldAudio = JSON.parse(await readFile(`${old}/audio-context.json`, 'utf8'));
const targetFolder = '極楽浄土';
const manifest = JSON.parse(await readFile(`maps/${targetFolder}/project.json`, 'utf8'));
const base = JSON.parse(
  await readFile(`maps/${targetFolder}/${manifest.drafts.fitness.file}`, 'utf8'),
);
// Never use an existing target chart's notes or beat answers as training data.
base.notes = [];
base.tempoSegments = [{ ...base.tempoSegments[0], bpm: 120, anchorMs: 0 }];
const media =
  manifest.media.find(
    (m) => m.id === base.videoHint.assetId || m.aliases?.includes(base.videoHint.assetId),
  ) ?? manifest.media[0];
const inputs = [
  ...refs.map((r) => ({
    ...r,
    audio: oldAudio.find((a) => a.title === r.chart.title),
    humanGrid: true,
  })),
  {
    file: `maps/${targetFolder}/project.json`,
    video: `maps/${targetFolder}/${media.file}`,
    chart: base,
    humanGrid: false,
  },
];
const { BpmEnvelope } = await load('src/bpm.ts');
const { MusicSpectrum } = await load('src/fitness/spectrum.ts');
const { generateFitness } = await load('src/fitness/retraining.ts');
const results = [];
for (const [index, input] of inputs.entries()) {
  const started = Date.now();
  const raw = spawnSync(
    process.env.WFP_FFMPEG ?? 'ffmpeg',
    ['-v', 'error', '-i', input.video, '-vn', '-ar', '22050', '-ac', '2', '-f', 'f32le', 'pipe:1'],
    { maxBuffer: 120 * 1024 * 1024 },
  );
  if (raw.status !== 0) throw Error(String(raw.stderr));
  const samples = new Float32Array(
    raw.stdout.buffer,
    raw.stdout.byteOffset,
    raw.stdout.byteLength / 4,
  );
  const wave = Float32Array.from(
    { length: samples.length / 2 },
    (_, i) => (samples[i * 2] + samples[i * 2 + 1]) / 2,
  );
  let audio = input.audio;
  if (!audio) {
    const env = new BpmEnvelope(wave.length / 22050),
      spectral = new MusicSpectrum();
    for (let i = 0; i < samples.length; i += 8192) {
      const length = Math.min(4096, (samples.length - i) / 2);
      const channels = Array.from({ length: 2 }, (_, c) =>
        Float32Array.from({ length }, (_, j) => samples[i + j * 2 + c]),
      );
      env.push(channels, 22050, i / 2 / 22050);
      spectral.push(channels, 22050, i / 2 / 22050);
    }
    audio = {
      title: base.title,
      base,
      onsets: Array.from(env.onsets()),
      levels: Array.from(env.levels()),
      spectrum: spectral.data(),
    };
    const tempo = generateFitness(
      base,
      Float32Array.from(audio.onsets),
      Float32Array.from(audio.levels),
    );
    audio.automaticTempo = {
      bpm: tempo.report.bpm,
      anchorMs: tempo.report.anchorMs,
      audioStartMs: tempo.report.audioStartMs,
      endMs: tempo.report.endMs,
    };
    await writeFile(`${out}/target-audio.json`, JSON.stringify(audio));
  }
  const grid = input.humanGrid ? input.chart.tempoSegments[0] : audio.automaticTempo;
  const { bpm, anchorMs } = grid,
    offset = input.chart.videoOffsetMs ?? 0,
    beats = [];
  for (let t = (anchorMs - offset) / 1000; t < wave.length / 22050; t += 60 / bpm)
    if (t >= 0) beats.push(t);
  const windows = buildLinkSegWindows(beats, wave),
    mel = melForWindows(windows.windows);
  const outputs = await session.run(
    { mel: new ort.Tensor('float32', mel, [windows.windows.length, 1, 64, 64]) },
    ['bound', 'label', 'embedding'],
  );
  const decoded = linksegDecode(
    outputs.bound.data,
    outputs.label.data,
    windows.beatTimes,
    wave.length / 22050,
    9,
    8,
    8,
    0,
  );
  const sections = decoded.labels.map((label, i) => ({
    startMs: Math.round(decoded.times[i] * 1000),
    endMs: Math.round(decoded.times[i + 1] * 1000),
    label,
  }));
  const result = {
    song: input.chart.title,
    source: input.file,
    sourceSha256: input.sha256,
    bpm,
    anchorMs,
    beatSource: input.humanGrid
      ? 'authored grid (isolate structure analysis)'
      : 'automatic audio tempo/start; no target chart notes/grid used',
    sections,
    elapsedMs: Date.now() - started,
  };
  results.push(result);
  await writeFile(
    `${out}/sections-${index}.json`,
    JSON.stringify(
      {
        ...result,
        bound: Array.from(outputs.bound.data),
        label: Array.from(outputs.label.data),
        embedding: Array.from(outputs.embedding.data),
        beatTimes: windows.beatTimes,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(result));
}
await session.release();
await writeFile(
  `${out}/structure-study.json`,
  JSON.stringify(
    {
      status: 'unverified nine-class model predictions; not human truth or a vocal-entry detector',
      results,
    },
    null,
    2,
  ),
);
