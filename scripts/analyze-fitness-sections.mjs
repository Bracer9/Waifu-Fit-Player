// Offline evaluation only. The optional inference dependency and downloaded
// upstream source/model live under artifacts, not in the shipped game.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readHumanReferences } from './fitness-references.mjs';
const out = 'artifacts/fitness-retrain-2026-10-24';
const source = path.resolve(out, 'linkseg/src');
const { outputFiles } = await build({
  stdin: {
    contents: `export {buildLinkSegWindows} from './windows'; export {melForWindows} from './mel'; export {linksegDecode} from './decode';`,
    resolveDir: source,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
});
const { buildLinkSegWindows, melForWindows, linksegDecode } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
const ort = await import(
  pathToFileURL(path.resolve(out, 'runtime/node_modules/onnxruntime-web/dist/ort.node.min.mjs'))
    .href
);
ort.env.wasm.numThreads = 1;
const modelBytes = await readFile(`${out}/linkseg/linkseg_7c.onnx`);
const session = await ort.InferenceSession.create(new Uint8Array(modelBytes), {
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',
});
const refs = await readHumanReferences(),
  results = [];
for (const ref of refs) {
  const started = Date.now();
  const raw = spawnSync(
    process.env.WFP_FFMPEG ?? 'ffmpeg',
    ['-v', 'error', '-i', ref.video, '-vn', '-ar', '22050', '-ac', '1', '-f', 'f32le', 'pipe:1'],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  if (raw.status !== 0) throw Error(String(raw.stderr));
  const wave = new Float32Array(
    raw.stdout.buffer,
    raw.stdout.byteOffset,
    raw.stdout.byteLength / 4,
  );
  const { bpm, anchorMs } = ref.chart.tempoSegments[0],
    offset = ref.chart.videoOffsetMs ?? 0;
  const beatMs = 60000 / bpm,
    beats = [];
  for (let t = (anchorMs - offset) / 1000; t < wave.length / 22050; t += beatMs / 1000)
    if (t >= 0) beats.push(t);
  const windows = buildLinkSegWindows(beats, wave),
    mel = melForWindows(windows.windows);
  const inference = Date.now();
  const outputs = await session.run(
    { mel: new ort.Tensor('float32', mel, [windows.windows.length, 1, 64, 64]) },
    ['bound', 'label'],
  );
  const decoded = linksegDecode(
    outputs.bound.data,
    outputs.label.data,
    windows.beatTimes,
    wave.length / 22050,
    7,
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
    song: ref.chart.title,
    source: ref.file,
    sourceSha256: ref.sha256,
    bpm,
    anchorMs,
    beatSource: 'human grid for structure-model isolation; not an automatic tempo evaluation',
    sections,
    elapsedMs: Date.now() - started,
    inferenceMs: Date.now() - inference,
  };
  results.push(result);
  await writeFile(
    `${out}/sections-${results.length - 1}.json`,
    JSON.stringify(
      {
        ...result,
        bound: Array.from(outputs.bound.data),
        label: Array.from(outputs.label.data),
        beatTimes: windows.beatTimes,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(result));
}
await session.release();
await mkdir('docs/fitness', { recursive: true });
const tree = JSON.parse(await readFile(`${out}/linkseg/upstream-tree.json`, 'utf8'));
await writeFile(
  'docs/fitness/STRUCTURE-STUDY-2026-10-24.json',
  JSON.stringify(
    {
      model: 'LinkSeg 7-class ONNX',
      modelSha256: createHash('sha256').update(modelBytes).digest('hex'),
      portCommit: tree.sha,
      license: 'CC-BY-4.0 model; MIT port',
      status:
        'unverified model predictions, not human structure labels; no B-melody/prechorus or vocal entry detector',
      results,
    },
    null,
    2,
  ) + '\n',
);
