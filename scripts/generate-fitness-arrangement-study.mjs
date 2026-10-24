// Fit all four explicitly approved human references; generate a separate song.
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const out = 'artifacts/fitness-v4-2026-10-24',
  old = 'artifacts/fitness-retrain-2026-10-24';
await build({
  entryPoints: ['src/fitness/arrangement-study.ts'],
  bundle: true,
  outfile: `${out}/arrangement-study.mjs`,
  format: 'esm',
});
const { learnArrangement, arrangeFitness } = await import(
  pathToFileURL(path.resolve(`${out}/arrangement-study.mjs`)).href
);
const audio = JSON.parse(await readFile(`${old}/audio-context.json`, 'utf8'));
const training = await Promise.all(
  audio.map(async (a, i) => ({
    audio: a,
    structure: JSON.parse(await readFile(`${out}/sections-${i}.json`, 'utf8')),
  })),
);
const model = learnArrangement(training);
await writeFile(`${out}/arrangement-model.json`, JSON.stringify(model));
const target = JSON.parse(await readFile(`${out}/target-audio.json`, 'utf8'));
const structure = JSON.parse(await readFile(`${out}/sections-4.json`, 'utf8'));
const result = arrangeFitness(target, structure, target.automaticTempo, model);
await writeFile(`${out}/arrangement-target.json`, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      trainingSongs: result.report.trainingSongs,
      target: target.title,
      targetInTraining: result.report.targetInTraining,
      notes: result.chart.notes.length,
      grid: result.report.grid,
      plan: result.report.plan.map((p) => ({
        startMs: p.startMs,
        endMs: p.endMs,
        id: p.brickId,
        label: p.label,
        repeats: p.repeats,
        function: p.function,
        squatRun: p.squatRun,
      })),
      modes: result.chart.notes
        .filter((n) => n.kind === 'hold')
        .map((n) => ({
          lane: n.lane,
          modifier: n.modifier,
          startMs: n.timeMs,
          endMs: n.endTimeMs,
        })),
      musicRepeats: result.report.musicRepeats.length,
    },
    null,
    2,
  ),
);
if (process.argv.includes('--references')) {
  const comparison = [];
  for (const [i, { audio: a, structure: s }] of training.entries()) {
    const t = a.base.tempoSegments[0],
      offset = a.base.videoOffsetMs ?? 0;
    const grid = {
      bpm: t.bpm,
      anchorMs: t.anchorMs,
      audioStartMs: t.anchorMs - offset,
      endMs: a.base.playRange?.endMs ?? a.base.videoHint.durationMs,
    };
    try {
      const reconstructed = arrangeFitness(a, s, grid, model);
      await writeFile(
        `${out}/arrangement-reference-${i}.json`,
        JSON.stringify(reconstructed, null, 2),
      );
      const longs = (notes) =>
        notes
          .filter((n) => n.kind === 'hold' && n.lane !== 'punch')
          .map((n) => ({
            lane: n.lane,
            modifier: n.modifier,
            startMs: n.timeMs,
            endMs: n.endTimeMs,
          }));
      comparison.push({
        song: a.title,
        targetInTraining: true,
        referenceNotes: a.base.notes.length,
        generatedNotes: reconstructed.chart.notes.length,
        referenceLongs: longs(a.base.notes),
        generatedLongs: longs(reconstructed.chart.notes),
        referenceLongModes: [...new Set(longs(a.base.notes).map((n) => `${n.lane}:${n.modifier}`))],
        generatedLongModes: [
          ...new Set(longs(reconstructed.chart.notes).map((n) => `${n.lane}:${n.modifier}`)),
        ],
      });
    } catch (e) {
      comparison.push({ song: a.title, error: e.message });
    }
  }
  await writeFile(
    `${out}/reference-comparison.json`,
    JSON.stringify(
      {
        status:
          'training reconstructions diagnose vocabulary/phase behavior; differences are not quality scores or unseen-song evaluation',
        results: comparison,
      },
      null,
      2,
    ),
  );
  console.log(
    'Reference reconstruction diagnostics:',
    JSON.stringify(
      comparison.map(({ song, error, referenceLongModes, generatedLongModes }) => ({
        song,
        error,
        referenceLongModes,
        generatedLongModes,
      })),
    ),
  );
}
