import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const out = 'artifacts/fitness-retrain-2026-10-24';
const bundle = (
  await build({
    entryPoints: ['src/fitness/phrase-learning.ts'],
    bundle: true,
    write: false,
    format: 'esm',
  })
).outputFiles[0].text;
const { movementCell, phraseFeatures, fitPhraseModel, predictMovementCell, PLAN_MODES } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle).toString('base64'));
const audio = JSON.parse(await readFile(`${out}/audio-context.json`, 'utf8'));
const structures = JSON.parse(
  await readFile('docs/fitness/STRUCTURE-STUDY-2026-10-24.json', 'utf8'),
);
const examples = [],
  timeline = [];
for (const a of audio) {
  const chart = a.base,
    beatMs = 60000 / chart.tempoSegments[0].bpm,
    origin = chart.tempoSegments[0].anchorMs - (chart.videoOffsetMs ?? 0),
    end = chart.playRange?.endMs ?? chart.videoHint.durationMs;
  const onsets = Float32Array.from(a.onsets),
    levels = Float32Array.from(a.levels),
    sections = structures.results.find((r) => r.song === a.title).sections;
  const rows = [];
  const notes = chart.notes.map((n) => ({
    ...n,
    timeMs: n.timeMs - (chart.videoOffsetMs ?? 0),
    ...(n.kind === 'hold' ? { endTimeMs: n.endTimeMs - (chart.videoOffsetMs ?? 0) } : {}),
  }));
  for (let start = origin; start + 4 * beatMs <= end; start += 4 * beatMs) {
    const target = movementCell(notes, start, start + 4 * beatMs, beatMs),
      values = phraseFeatures(onsets, levels, a.spectrum, sections, start, beatMs);
    const entry = {
      song: a.title,
      brickId: 'bar-profile',
      family:
        target.rest > 0.5
          ? 'REST'
          : PLAN_MODES.filter((_, i) => target.presence[i] > 0.25).join('+'),
      beats: 4,
      startMs: Math.round(start),
      endMs: Math.round(start + 4 * beatMs),
      values,
      target,
    };
    examples.push(entry);
    rows.push(entry);
  }
  timeline.push({
    song: a.title,
    bars: rows.map(({ values, ...r }) => r),
    restBars: rows.filter((r) => r.target.rest === 1).length,
  });
}
const model = fitPhraseModel(examples),
  folds = [];
for (const a of audio) {
  const training = examples.filter((e) => e.song !== a.title),
    testing = examples.filter((e) => e.song === a.title),
    heldout = fitPhraseModel(training);
  let tp = 0,
    fp = 0,
    fn = 0,
    restTrue = 0,
    restHit = 0,
    restFalse = 0;
  for (const e of testing) {
    const p = predictMovementCell(e.values, heldout);
    for (let i = 0; i < PLAN_MODES.length; i++) {
      const actual = e.target.presence[i] > 0.25,
        guess = p.presence[i] > 0.5;
      if (actual && guess) tp++;
      else if (guess) fp++;
      else if (actual) fn++;
    }
    if (e.target.rest === 1) {
      restTrue++;
      if (p.rest > 0.5) restHit++;
    } else if (p.rest > 0.5) restFalse++;
  }
  folds.push({
    song: a.title,
    trainingSongs: [...new Set(training.map((e) => e.song))],
    bars: testing.length,
    modePresenceF1: (2 * tp) / (2 * tp + fp + fn || 1),
    restTrue,
    restHit,
    restFalse,
  });
}
await writeFile(`${out}/phrase-model.json`, JSON.stringify(model));
await writeFile(
  'docs/fitness/DYNAMICS-STUDY-2026-10-24.json',
  JSON.stringify(
    {
      status:
        'experimental labels; rest requires no notes, no active hold and no unresolved lower-body load; not clinical intensity',
      modes: PLAN_MODES,
      folds,
      timeline,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    {
      examples: examples.length,
      restBars: examples.filter((e) => e.target.rest === 1).length,
      folds,
    },
    null,
    2,
  ),
);
