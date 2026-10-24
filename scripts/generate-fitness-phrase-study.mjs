import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const out = 'artifacts/fitness-retrain-2026-10-24';
const load = async (file) =>
  import(
    'data:text/javascript;base64,' +
      Buffer.from(
        (await build({ entryPoints: [file], bundle: true, write: false, format: 'esm' }))
          .outputFiles[0].text,
      ).toString('base64')
  );
const { planPhraseFitness } = await load('src/fitness/phrase-planner.ts');
const { fitPhraseModel, movementCell } = await load('src/fitness/phrase-learning.ts');
const model = JSON.parse(await readFile(`${out}/phrase-model.json`, 'utf8')),
  audio = JSON.parse(await readFile(`${out}/audio-context.json`, 'utf8')),
  structure = JSON.parse(await readFile('docs/fitness/STRUCTURE-STUDY-2026-10-24.json', 'utf8'));
const results = [];
for (let i = 0; i < audio.length; i++) {
  const a = audio[i],
    variants = {};
  for (const variant of ['training', 'heldout']) {
    const m =
      variant === 'training'
        ? model
        : fitPhraseModel(model.examples.filter((e) => e.song !== a.title));
    const start = Date.now();
    try {
      const r = planPhraseFitness(
        a.base,
        Float32Array.from(a.onsets),
        Float32Array.from(a.levels),
        a.spectrum,
        structure.results.find((s) => s.song === a.title).sections,
        m,
      );
      r.report.planner +=
        variant === 'training'
          ? '; target song is in training'
          : ' ; entire target song excluded from movement training';
      const beatMs = 60000 / a.base.tempoSegments[0].bpm,
        origin = a.base.tempoSegments[0].anchorMs;
      let tp = 0,
        fp = 0,
        fn = 0;
      for (
        let t = origin;
        t + 4 * beatMs < (a.base.playRange?.endMs ?? a.base.videoHint.durationMs);
        t += 4 * beatMs
      ) {
        const expected = movementCell(a.base.notes, t, t + 4 * beatMs, beatMs),
          actual = movementCell(r.chart.notes, t, t + 4 * beatMs, beatMs);
        for (let n = 0; n < expected.presence.length; n++) {
          const x = expected.presence[n] > 0.25,
            y = actual.presence[n] > 0.25;
          if (x && y) tp++;
          else if (y) fp++;
          else if (x) fn++;
        }
      }
      const handBalance = Object.fromEntries(
        ['punch', 'side_crunch'].map((l) => [
          l,
          Object.fromEntries(
            ['left', 'right'].map((d) => [
              d,
              r.chart.notes.filter((n) => n.lane === l && (n.hand ?? n.direction) === d).length,
            ]),
          ),
        ]),
      );
      const summary = {
        notes: r.chart.notes.length,
        modePresenceF1: (2 * tp) / (2 * tp + fp + fn || 1),
        handBalance,
        longs: r.chart.notes.filter((n) => n.kind === 'hold' && n.lane !== 'punch'),
        elapsedMs: Date.now() - start,
        trainingSongs: [...new Set(m.examples.map((e) => e.song))],
      };
      await writeFile(`${out}/phrase-${variant}-${i}.json`, JSON.stringify(r, null, 2));
      variants[variant] = summary;
      console.log(
        JSON.stringify({
          song: a.title,
          variant,
          ...summary,
          longs: summary.longs.map((n) => ({
            lane: n.lane,
            modifier: n.modifier,
            startMs: n.timeMs,
            endMs: n.endTimeMs,
          })),
        }),
      );
    } catch (e) {
      variants[variant] = { error: e.message };
      console.log(a.title, variant, e.message);
    }
  }
  results.push({ song: a.title, variants });
}
await writeFile(
  'docs/fitness/PHRASE-VALIDATION-2026-10-24.json',
  JSON.stringify(
    {
      status:
        'experimental; training-track reconstruction is not generalization; mode overlap is not a coaching score',
      results,
    },
    null,
    2,
  ) + '\n',
);
