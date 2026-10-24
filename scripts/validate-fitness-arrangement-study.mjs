import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readHumanReferences } from './fitness-references.mjs';
const out = 'artifacts/fitness-v4-2026-10-24';
const hash = (b) => createHash('sha256').update(b).digest('hex');
async function mapsSnapshot(dir = 'maps') {
  const files = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name).replaceAll('\\', '/');
    if (e.isDirectory()) Object.assign(files, await mapsSnapshot(f));
    else if (f.endsWith('.json')) files[f] = hash(await readFile(f));
  }
  return files;
}
const baselineFile = `${out}/maps-before-review.json`;
let baseline;
try {
  baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  baseline = await mapsSnapshot();
  await writeFile(baselineFile, JSON.stringify(baseline, null, 2));
}
const refs = await readHumanReferences(),
  warehouse = JSON.parse(await readFile('src/fitness/bricks-study.json', 'utf8'));
for (const ref of refs)
  assert.equal(
    ref.sha256,
    warehouse.references.find((r) => r.file === ref.file).sha256,
    'Human reference changed since study',
  );
const r = JSON.parse(await readFile(`${out}/arrangement-target.json`, 'utf8')),
  chart = r.chart,
  beat = 60000 / r.report.grid.bpm;
assert.equal(r.report.targetInTraining, false);
assert(!r.report.trainingSongs.includes(chart.title));
const range = chart.playRange ?? { startMs: 0, endMs: chart.videoHint.durationMs };
const offset = chart.videoOffsetMs ?? 0;
assert(chart.notes.length > 0);
let maxGridError = 0;
for (const n of chart.notes) {
  assert(
    ['squat', 'punch', 'calf_raise', 'side_crunch'].includes(n.lane),
    'STEP/SPECIAL in Fitness',
  );
  assert(n.timeMs - offset >= range.startMs && n.timeMs - offset <= range.endMs, 'Outside range');
  const phase = (n.timeMs - r.report.grid.anchorMs) / beat;
  maxGridError = Math.max(maxGridError, Math.abs(phase - Math.round(phase * 4) / 4) * beat);
  if (n.kind === 'hold') {
    assert(n.endTimeMs > n.timeMs && n.endTimeMs - offset <= range.endMs, 'Invalid hold');
    assert(n.endTimeMs - n.timeMs <= 15001, 'Excessive individual hold');
  }
}
assert(maxGridError <= 1.1);
const hand = (n) =>
  n.lane === 'punch'
    ? n.armAction === 'punch' || !n.armAction
      ? n.direction
      : n.hand
    : n.direction;
const balance = Object.fromEntries(
  ['punch', 'side_crunch'].map((l) => [
    l,
    Object.fromEntries(
      ['left', 'right'].map((s) => [
        s,
        chart.notes.filter((n) => n.lane === l && (hand(n) === s || hand(n) === 'both')).length,
      ]),
    ),
  ]),
);
for (const [lane, b] of Object.entries(balance)) assert.equal(b.left, b.right, `${lane} asymmetry`);
const collisions = [];
for (const h of chart.notes.filter((n) => n.kind === 'hold'))
  for (const n of chart.notes) {
    if (n === h || n.lane !== h.lane || n.timeMs < h.timeMs - 1 || n.timeMs >= h.endTimeMs - 1)
      continue;
    if (h.lane === 'punch' && hand(h) !== 'both' && hand(n) !== 'both' && hand(h) !== hand(n))
      continue;
    collisions.push({ hold: h.id, note: n.id });
  }
assert.equal(collisions.length, 0, 'Overlapping movement channel');
const rests = [];
for (const p of r.report.plan.filter((p) => p.brickId === 'REST')) {
  const s = p.startMs + offset,
    e = p.endMs + offset;
  assert(
    !chart.notes.some((n) => n.kind === 'hold' && n.timeMs < e - 1 && n.endTimeMs > s + 1),
    'Rest inside hold',
  );
  for (const [lane, release] of [
    ['squat', 'up'],
    ['calf_raise', 'down'],
  ]) {
    const last = chart.notes.filter((n) => n.lane === lane && n.timeMs <= s + 1).at(-1);
    assert(!last || last.direction === release, 'Rest without explicit lower-body return');
  }
  rests.push({
    startMs: p.startMs,
    endMs: p.endMs,
    beats: +((p.endMs - p.startMs) / beat).toFixed(2),
  });
}
const plan = r.report.plan;
for (const p of plan) {
  assert(p.squatRun <= 64 && p.calfRun <= 96);
}
const side = plan.filter((p) =>
  warehouse.bricks.find((b) => b.id === p.brickId)?.lanes.includes('side_crunch'),
);
const sideBeats = side.reduce((s, p) => s + (p.endMs - p.startMs) / beat, 0);
assert(sideBeats <= r.report.sideBudgetBeats + 0.01);
for (let i = 0; i < side.length; i++) {
  assert((side[i].endMs - side[i].startMs) / beat <= 8.01);
  if (i) assert(side[i].startMs - side[i - 1].endMs >= 96 * beat - 1);
}
const echoes = plan
  .filter((p) => p.musicRepeat)
  .map((p) => {
    const previousMs = r.report.bars[p.musicRepeat.previous].startMs;
    const old = plan.find((x) => Math.abs(x.startMs - previousMs) < 2);
    return {
      startMs: p.startMs,
      previousMs: Math.round(previousMs),
      similarity: p.musicRepeat.similarity,
      sameGroup: old?.brickId === p.brickId && old?.repeats === p.repeats,
    };
  });
const now = await mapsSnapshot(),
  changes = [];
for (const f of new Set([...Object.keys(now), ...Object.keys(baseline)]))
  if (now[f] !== baseline[f]) changes.push(f);
if (process.argv.includes('--after-install')) {
  const saved = JSON.parse(await readFile(`${out}/installed-study.json`, 'utf8'));
  const folder = path.dirname(saved.file).replaceAll('\\', '/');
  const allowed = new Set(
    [
      saved.file.replaceAll('\\', '/').replace(/^.*?maps\//, 'maps/'),
      `${folder}/project.json`,
      `${folder}/.wfp-backup/project.json`,
    ].map((f) => f.replace(/^.*?maps\//, 'maps/')),
  );
  assert(
    changes.every((f) => allowed.has(f)),
    'Unrelated maps changes: ' + changes.filter((f) => !allowed.has(f)).join(', '),
  );
  assert.equal(now[`maps/極楽浄土/wfp-fitness-draft-${saved.id}.json`], saved.sha256);
} else assert.equal(changes.length, 0, 'Maps changed during generation');
const model = JSON.parse(await readFile(`${out}/arrangement-model.json`, 'utf8'));
const coverage = Object.fromEntries(
  ['squat:hold', 'squat:sway', 'calf_raise:sway'].map((name) => {
    const mode = [
      'squat:tap',
      'squat:hold',
      'squat:sway',
      'punch:tap',
      'punch:hold',
      'punch:sway',
      'calf_raise:tap',
      'calf_raise:hold',
      'calf_raise:sway',
      'side_crunch:tap',
    ].indexOf(name);
    const rows = model.examples.filter((e) => e.target.presence[mode] > 0.25);
    assert(rows.length > 0);
    return [name, { bars: rows.length, songs: [...new Set(rows.map((e) => e.song))] }];
  }),
);
const report = {
  status: 'objective notation checks only; musical/coaching quality awaits actual review',
  title: chart.title,
  targetInTraining: false,
  referenceHashes: refs.map((r) => ({ file: r.file, sha256: r.sha256 })),
  coverage,
  noteCount: chart.notes.length,
  laneCounts: Object.fromEntries(
    ['squat', 'punch', 'calf_raise', 'side_crunch'].map((l) => [
      l,
      chart.notes.filter((n) => n.lane === l).length,
    ]),
  ),
  handBalance: balance,
  maxGridErrorMs: maxGridError,
  overlappingChannels: collisions.length,
  rests,
  sideBeats,
  sideBudget: r.report.sideBudgetBeats,
  echoes,
  holds: chart.notes
    .filter((n) => n.kind === 'hold')
    .map((n) => ({ lane: n.lane, modifier: n.modifier, startMs: n.timeMs, endMs: n.endTimeMs })),
  mapsChanges: changes,
  existingHumanChartsUnchanged: true,
};
await writeFile(
  `${out}/notation-validation${process.argv.includes('--after-install') ? '-installed' : ''}.json`,
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    { ...report, referenceHashes: undefined, echoes: echoes.length, coverage },
    null,
    2,
  ),
);
