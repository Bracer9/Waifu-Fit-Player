import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = 'artifacts/fitness-retrain-2026-10-24';
const load = async (file) =>
  import(
    'data:text/javascript;base64,' +
      Buffer.from(
        (await build({ entryPoints: [file], bundle: true, write: false, format: 'esm' }))
          .outputFiles[0].text,
      ).toString('base64')
  );
const { generateFitness } = await load('src/fitness/retraining.ts');
const baseline = await import(pathToFileURL(path.resolve(out, 'baseline-generator.mjs')).href);
const { fitContext } = await load('src/fitness/learning.ts');
const audio = JSON.parse(await readFile(`${out}/audio-context.json`, 'utf8'));
const model = JSON.parse(await readFile(`${out}/context-model.json`, 'utf8'));
const structure = JSON.parse(
  await readFile('docs/fitness/STRUCTURE-STUDY-2026-10-24.json', 'utf8'),
);
const mode = (n) =>
  `${n.lane}:${n.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'hold') : 'tap'}`;
function isReturn(n, notes) {
  return (
    n.kind === 'tap' &&
    ['squat', 'calf_raise'].includes(n.lane) &&
    notes.some(
      (h) =>
        h.lane === n.lane &&
        h.kind === 'hold' &&
        h.direction !== n.direction &&
        Math.abs(h.endTimeMs - n.timeMs) < 3,
    )
  );
}
function profile(chart, grid) {
  const beatMs = 60000 / grid.tempoSegments[0].bpm,
    origin = grid.tempoSegments[0].anchorMs - (grid.videoOffsetMs ?? 0),
    offset = chart.videoOffsetMs ?? 0;
  const notes = chart.notes.filter((n) => !isReturn(n, chart.notes));
  const windows = [];
  const exposureSeconds = {};
  for (const n of notes)
    if (n.kind === 'hold')
      exposureSeconds[mode(n)] = (exposureSeconds[mode(n)] ?? 0) + (n.endTimeMs - n.timeMs) / 1000;
  for (
    let start = origin;
    start < (grid.playRange?.endMs ?? grid.videoHint.durationMs);
    start += beatMs * 4
  ) {
    const stop = start + beatMs * 4;
    windows.push(
      [
        ...new Set(
          notes
            .filter(
              (n) =>
                n.timeMs - offset < stop &&
                (n.kind === 'hold' ? n.endTimeMs - offset > start : n.timeMs - offset >= start),
            )
            .map(mode),
        ),
      ].sort(),
    );
  }
  const boundaries = windows.flatMap((w, i) =>
    i && JSON.stringify(w) !== JSON.stringify(windows[i - 1]) ? [origin + i * beatMs * 4] : [],
  );
  return {
    windows,
    boundaries,
    exposureSeconds,
    notes: chart.notes.length,
    longs: chart.notes
      .filter((n) => n.kind === 'hold' && n.lane !== 'punch')
      .map((n) => ({ mode: mode(n), startMs: n.timeMs - offset, endMs: n.endTimeMs - offset })),
  };
}
function compare(human, candidate) {
  let tp = 0,
    fp = 0,
    fn = 0;
  human.windows.forEach((a, i) => {
    const b = candidate.windows[i] ?? [];
    tp += a.filter((x) => b.includes(x)).length;
    fp += b.filter((x) => !a.includes(x)).length;
    fn += a.filter((x) => !b.includes(x)).length;
  });
  const matched = new Set(),
    errors = [];
  for (const h of human.boundaries) {
    const best = candidate.boundaries
      .map((t, i) => ({ t, i, distance: Math.abs(t - h) }))
      .filter((x) => !matched.has(x.i))
      .sort((a, b) => a.distance - b.distance)[0];
    if (best && best.distance < 2200) {
      matched.add(best.i);
      errors.push(best.distance);
    }
  }
  return {
    modePresenceF1: (2 * tp) / (2 * tp + fp + fn || 1),
    precision: tp / (tp + fp || 1),
    recall: tp / (tp + fn || 1),
    boundaryMatches: matched.size,
    humanBoundaries: human.boundaries.length,
    candidateBoundaries: candidate.boundaries.length,
    meanMatchedBoundaryErrorMs: errors.reduce((s, v) => s + v, 0) / (errors.length || 1),
  };
}
const results = [];
for (let i = 0; i < audio.length; i++) {
  const a = audio[i],
    onsets = Float32Array.from(a.onsets),
    levels = Float32Array.from(a.levels),
    human = profile(a.base, a.base);
  const options = {
    spectrum: a.spectrum,
    structure: structure.results.find((r) => r.song === a.title).sections,
    contextModel: model,
  };
  const variants = {
    baseline: () => baseline.generateFitness(a.base, onsets, levels),
    vocabulary: () => generateFitness(a.base, onsets, levels),
    structuredTraining: () => generateFitness(a.base, onsets, levels, 200, undefined, options),
    structuredHeldOut: () =>
      generateFitness(a.base, onsets, levels, 200, undefined, {
        ...options,
        contextModel: fitContext(model.examples.filter((e) => e.song !== a.title)),
      }),
  };
  const row = { song: a.title, human, variants: {} };
  for (const [name, run] of Object.entries(variants)) {
    try {
      const r = run(),
        p = profile(r.chart, a.base);
      row.variants[name] = {
        ...p,
        comparison: compare(human, p),
        bpm: r.report.bpm,
        anchorMs: r.report.anchorMs,
      };
      await writeFile(`${out}/${name}-${i}.json`, JSON.stringify(r, null, 2));
      if (name === 'structuredTraining')
        await writeFile(`${out}/candidate-${i}.wfp.json`, JSON.stringify(r.chart, null, 2));
      console.log(
        JSON.stringify({
          song: a.title,
          variant: name,
          notes: p.notes,
          longs: p.longs,
          comparison: row.variants[name].comparison,
        }),
      );
    } catch (e) {
      row.variants[name] = { error: e.message };
      console.log(a.title, name, e.message);
    }
  }
  results.push(row);
}
await writeFile(
  'docs/fitness/RETRAIN-VALIDATION-2026-10-24.json',
  JSON.stringify(
    {
      note: 'Mode-presence overlap is descriptive, not a score for coaching quality. Structure uses human beat grids to isolate structure inference; generation still estimates its own BPM/anchor. Training-track reconstruction is NOT generalization.',
      results,
    },
    null,
    2,
  ) + '\n',
);
