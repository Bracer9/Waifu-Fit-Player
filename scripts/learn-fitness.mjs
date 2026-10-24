// Read-only reference-chart mining. This script NEVER writes inside maps.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readHumanReferences } from './fitness-references.mjs';

const sources = await readHumanReferences();
const lanes = ['squat', 'punch', 'calf_raise', 'side_crunch'];
const patterns = new Map();
const references = [];
const signature = (notes) => JSON.stringify(notes);
function balanced(notes, beats) {
  for (const [lane, enter] of [
    ['squat', 'down'],
    ['calf_raise', 'up'],
  ]) {
    let active;
    for (const n of notes.filter((n) => n.lane === lane)) {
      if (n.direction !== enter && !active) return false;
      active = n.direction === enter ? n : undefined;
    }
    // A duration-bounded hold can release without a separate return tap in
    // the human chart. A tap cycle still needs its actual opposite movement.
    if (active && (active.kind !== 'hold' || active.at + active.duration > beats)) return false;
  }
  return true;
}
for (const source of sources) {
  const { file, chart } = source;
  const releasedFile = path.join(path.dirname(file), 'wfp-fitness-released.json');
  let released;
  try {
    released = JSON.parse(await readFile(releasedFile, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (chart.tempoSegments.length !== 1 || chart.tempoSegments[0].meter !== '4/4')
    throw new Error('Reference needs explicit constant 4/4 grid');
  const { anchorMs, bpm } = chart.tempoSegments[0],
    beatMs = 60000 / bpm;
  let error = 0;
  const notes = chart.notes
    .filter((n) => lanes.includes(n.lane))
    .map((n) => {
      const beat = (n.timeMs - anchorMs) / beatMs,
        at = Math.round(beat * 4) / 4;
      error = Math.max(error, Math.abs(beat - at));
      const out = { lane: n.lane, direction: n.direction, at, kind: n.kind };
      if (n.kind === 'hold') {
        out.duration = Math.round(((n.endTimeMs - n.timeMs) / beatMs) * 4) / 4;
        out.modifier = n.modifier;
      }
      for (const key of ['armAction', 'hand', 'foot']) if (n[key] !== undefined) out[key] = n[key];
      return out;
    })
    .sort((a, b) => a.at - b.at || lanes.indexOf(a.lane) - lanes.indexOf(b.lane));
  if (error > 0.03) throw new Error(`Off-grid reference: ${file}`);
  references.push({
    title: chart.title,
    file: file.replaceAll('\\', '/'),
    sha256: source.sha256,
    sourceName: source.source.name ?? '原人工参考',
    bpm,
    anchorMs,
    notes: notes.length,
    laneCounts: Object.fromEntries(lanes.map((l) => [l, notes.filter((n) => n.lane === l).length])),
    laneWorkBeats: Object.fromEntries(
      lanes.map((l) => [
        l,
        notes
          .filter((n) => n.lane === l)
          .reduce((sum, n) => sum + (n.kind === 'hold' ? n.duration : 2), 0),
      ]),
    ),
    maxQuantizationErrorBeats: error,
    draftMatchesReleasedNotes: released
      ? JSON.stringify(chart.notes) === JSON.stringify(released.notes)
      : false,
  });
  const last = Math.max(...notes.map((n) => n.at + (n.duration ?? 0)));
  for (const beats of [8, 16, 24, 32])
    for (let start = 0; start + beats <= last + 1; start += 4) {
      if (notes.some((n) => n.kind === 'hold' && n.at < start && n.at + n.duration > start))
        continue;
      const selected = notes
        .filter(
          (n) =>
            n.at >= start &&
            (n.at < start + beats ||
              (n.at === start + beats &&
                ((n.lane === 'squat' && n.direction === 'up') ||
                  (n.lane === 'calf_raise' && n.direction === 'down')))),
        )
        .map((n) => ({ ...n, at: n.at - start }));
      if (
        (selected.length < 4 && !selected.some((n) => n.kind === 'hold' && n.duration >= 4)) ||
        selected.some((n) => n.at + (n.duration ?? 0) > beats) ||
        !balanced(selected, beats)
      )
        continue;
      const used = lanes.filter((l) => selected.some((n) => n.lane === l));
      if (used.length > 2) continue;
      // Longer exact repetitions add no new movement vocabulary.
      if (beats > 8 && !selected.some((n) => n.at === beats)) {
        const half = beats / 2,
          a = selected.filter((n) => n.at < half),
          b = selected.filter((n) => n.at >= half).map((n) => ({ ...n, at: n.at - half }));
        if (signature(a) === signature(b)) continue;
      }
      const key = JSON.stringify([beats, selected]);
      let brick = patterns.get(key);
      if (!brick) {
        const side = (n) =>
          n.lane === 'punch'
            ? n.armAction === 'punch' || !n.armAction
              ? n.direction
              : n.hand
            : n.lane === 'side_crunch'
              ? (n.foot ?? n.direction)
              : undefined;
        const asymmetry = ['punch', 'side_crunch'].some(
          (l) =>
            selected.filter((n) => n.lane === l && side(n) === 'left').length !==
            selected.filter((n) => n.lane === l && side(n) === 'right').length,
        );
        brick = {
          id: 'fit-' + createHash('sha256').update(key).digest('hex').slice(0, 10),
          beats,
          lanes: used,
          mirrorRequired: asymmetry,
          entryPose: 'standing',
          exitPose: 'standing',
          durationBoundedRelease: selected.some(
            (n) =>
              ['squat', 'calf_raise'].includes(n.lane) &&
              n.kind === 'hold' &&
              !selected.some(
                (next) =>
                  next.lane === n.lane &&
                  next.at >= n.at + n.duration &&
                  next.direction !== n.direction,
              ),
          ),
          notes: selected,
          sources: [],
        };
        patterns.set(key, brick);
      }
      brick.sources.push({
        title: chart.title,
        file: file.replaceAll('\\', '/'),
        startBar: start / 4 + 1,
        endBar: (start + beats) / 4,
        startMs: Math.round(anchorMs + start * beatMs),
        endMs: Math.round(anchorMs + (start + beats) * beatMs),
      });
    }
}
const all = [...patterns.values()].sort(
  (a, b) => b.sources.length - a.sources.length || a.beats - b.beats || a.id.localeCompare(b.id),
);
// Stratify by movement mode, not just lane names. Sparse sustained movements
// are vocabulary, not failed low-note-count windows.
const selected = [];
const familyOf = (b) =>
  [
    ...new Set(
      b.notes.map(
        (n) => `${n.lane}:${n.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'hold') : 'tap'}`,
      ),
    ),
  ]
    .sort()
    .join('+');
for (const family of [...new Set(all.map(familyOf))]) {
  const choices = all.filter((b) => familyOf(b) === family);
  for (const brick of choices.slice(0, 4)) selected.push(brick);
}
for (const brick of all)
  if (selected.length < 28 && !selected.some((b) => b.id === brick.id)) selected.push(brick);
// Preserve every observed long-movement duration at its true onset, including
// uncommon 6/7-bar endings. Frequency pruning must not delete the very example
// whose relationship to the music we are trying to learn.
for (const source of sources)
  for (const note of source.chart.notes.filter(
    (n) => n.kind === 'hold' && ['squat', 'calf_raise'].includes(n.lane),
  )) {
    const beatMs = 60000 / source.chart.tempoSegments[0].bpm;
    const duration = Math.round(((note.endTimeMs - note.timeMs) / beatMs) * 4) / 4;
    const candidates = all.filter(
      (b) =>
        b.sources.some((s) => s.file === source.file && Math.abs(s.startMs - note.timeMs) < 2) &&
        b.notes.some(
          (n) =>
            n.at === 0 &&
            n.lane === note.lane &&
            n.kind === 'hold' &&
            n.modifier === note.modifier &&
            n.duration === duration,
        ),
    );
    const candidate = candidates.sort(
      (a, b) => a.beats - b.beats || b.notes.length - a.notes.length,
    )[0];
    if (candidate && !selected.some((b) => b.id === candidate.id)) selected.push(candidate);
  }
for (const brick of selected) {
  brick.family = familyOf(brick);
  brick.label =
    brick.lanes
      .map((l) => ({ squat: '蹲起', punch: '手臂', calf_raise: '踮脚', side_crunch: '侧收腹' })[l])
      .join('＋') + ` / ${brick.beats / 4}小节`;
  // Score sustained occupancy as well as arrivals; a 32-beat squat hold
  // must not be classified as a one-note recovery passage.
  const weights = { squat: 1.4, punch: 0.5, calf_raise: 0.35, side_crunch: 1.5 };
  brick.activity = Math.min(
    1,
    brick.notes.reduce(
      (sum, n) =>
        sum +
        weights[n.lane] *
          (n.kind === 'hold' ? (n.duration ?? 0) * (n.modifier === 'sway' ? 0.65 : 0.8) : 1),
      0,
    ) / brick.beats,
  );
  brick.sourceBpm = [
    ...new Set(brick.sources.map((s) => references.find((r) => r.title === s.title).bpm)),
  ];
}
await mkdir('src/fitness', { recursive: true });
await mkdir('docs/fitness', { recursive: true });
const longCoverage = sources.flatMap((source) =>
  source.chart.notes
    .filter((n) => n.kind === 'hold' && ['squat', 'calf_raise'].includes(n.lane))
    .map((note) => {
      const duration =
        Math.round(
          ((note.endTimeMs - note.timeMs) / (60000 / source.chart.tempoSegments[0].bpm)) * 4,
        ) / 4;
      const matches = selected.filter(
        (b) =>
          b.sources.some((s) => s.file === source.file && Math.abs(s.startMs - note.timeMs) < 2) &&
          b.notes.some(
            (n) =>
              n.at === 0 &&
              n.lane === note.lane &&
              n.kind === 'hold' &&
              n.modifier === note.modifier &&
              n.duration === duration,
          ),
      );
      return {
        file: source.file,
        startMs: note.timeMs,
        lane: note.lane,
        modifier: note.modifier,
        durationBeats: duration,
        brickIds: matches.map((b) => b.id),
      };
    }),
);
if (longCoverage.some((c) => !c.brickIds.length))
  throw Error('A human sustained movement would be lost; study vocabulary not written.');
await writeFile(
  'src/fitness/bricks-study.json',
  JSON.stringify({ version: 3, references, longCoverage, bricks: selected }, null, 2) + '\n',
);
await writeFile(
  'docs/fitness/LEARNING.md',
  `# Fitness 研究语料与积木学习记录\n\n这是从四首人工谱重新提取的研究资料，不是已经训练成功的生成模型，也没有替换游戏当前使用的三首／35积木版本。复合学习、失败对照和音乐解析见[本轮报告](RETRAIN-2026-10-24.md)。原谱面仅只读。\n\n` +
    references
      .map(
        (r) =>
          `- **${r.title}**（${r.sourceName}）：${r.notes} 个动作，${r.bpm} BPM，锚点 ${r.anchorMs}ms；与发布版音符${r.draftMatchesReleasedNotes ? '一致' : '不同'}，量化最大误差 ${r.maxQuantizationErrorBeats.toFixed(4)} 拍。来源：\`${r.file}\`，SHA256：\`${r.sha256}\`。`,
      )
      .join('\n') +
    `\n\n共找到 ${all.length} 个独特候选，研究库保留 ${selected.length} 个积木；${longCoverage.length} 处原始蹲／踮脚长动作均有从实际起点保留原时长的来源记录。完整拍序列、来源时间／小节、镜像及长动作覆盖索引见 [bricks-study.json](../../src/fitness/bricks-study.json)。\n\n## 提取规则与限制\n\n1. 四轨，保留原 HOLD／SWAY 时长、回位及同时配合的手臂，不随机拆轨拼接。\n2. 不再按最少4个音符过滤长段落；按动作模式分层，并逐一核对原长动作，避免按常见轨道组合挤掉稀有动作。\n3. 2／4／6／8小节窗口，不截断长条；完整长动作可以只有1～2条记录。TAP周期仍须回位；原谱按长条结束且无独立回位音符的记录保持原样。\n4. entryPose／exitPose仍为继承字段，未建成可靠的跨段姿态模型，不能当成人工已确认的站姿标签。HOLD→SWAY连续低姿态是必须保留的反例。\n5. activity新增持续拍数项，但权重仍是实验启发式，不是学习得出的专业运动强度，更不是医疗／训练处方。\n6. 模板去重和镜像只解决词汇完整性；曲式解析、音乐段落功能与动作负荷的联合学习及验证仍是独立必需环节。\n\n## 研究库目录\n\n| ID | 组合 | 来源出现数 | 需成对镜像 |\n| --- | --- | ---: | --- |\n` +
    selected
      .map(
        (b) => `| ${b.id} | ${b.label} | ${b.sources.length} | ${b.mirrorRequired ? '是' : '否'} |`,
      )
      .join('\n') +
    '\n',
);
console.log(
  JSON.stringify(
    {
      references: references.map(({ title, notes, bpm }) => ({ title, notes, bpm })),
      candidates: all.length,
      selected: selected.length,
      families: [...new Set(selected.map((b) => b.lanes.join('+')))],
    },
    null,
    2,
  ),
);
