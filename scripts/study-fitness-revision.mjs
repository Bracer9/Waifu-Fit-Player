// Reproducible, read-only audit. Outputs evidence; does not save a user chart.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readHumanReferences } from './fitness-references.mjs';

const out = 'artifacts/fitness-retrain-2026-10-24';
await mkdir(out, { recursive: true });
async function manifest(dir) {
  const result = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(result, await manifest(f));
    else if (e.name.endsWith('.json'))
      result[f.replaceAll('\\', '/')] = createHash('sha256')
        .update(await readFile(f))
        .digest('hex');
  }
  return result;
}
const hashes = await manifest('maps');
const hashFile = `${out}/maps-before.json`;
if (process.argv.includes('--verify')) {
  const before = JSON.parse(await readFile(hashFile, 'utf8'));
  const changed = [...new Set([...Object.keys(before), ...Object.keys(hashes)])].filter(
    (f) => before[f] !== hashes[f],
  );
  if (process.argv.includes('--after-install')) {
    const installed = JSON.parse(await readFile(`${out}/installed-study.json`, 'utf8'));
    const dir = 'maps/愛スクリ～ム/',
      file = dir + path.basename(installed.file);
    const allowed = new Set([dir + 'project.json', dir + '.wfp-backup/project.json', file]);
    const unexpected = changed.filter((f) => !allowed.has(f));
    if (
      unexpected.length ||
      hashes[file] !== installed.sha256 ||
      hashes[dir + '.wfp-backup/project.json'] !== before[dir + 'project.json']
    )
      throw Error('Unexpected maps change after approved installation: ' + unexpected.join(', '));
    await writeFile(
      `${out}/maps-integrity-after-install.json`,
      JSON.stringify(
        {
          originalFiles: Object.keys(before).length,
          currentFiles: Object.keys(hashes).length,
          authorizedChanges: changed,
          allExistingChartsUnchanged: true,
          newDraft: file,
          sha256: hashes[file],
        },
        null,
        2,
      ),
    );
    console.log(
      'Only the independent review draft, manifest and normal manifest backup changed; all existing charts unchanged.',
    );
    process.exit(0);
  }
  await writeFile(
    `${out}/maps-integrity.json`,
    JSON.stringify(
      {
        originalFiles: Object.keys(before).length,
        currentFiles: Object.keys(hashes).length,
        changed,
      },
      null,
      2,
    ),
  );
  if (changed.length) throw Error(`maps changed: ${changed.join(', ')}`);
  console.log(`All ${Object.keys(hashes).length} maps JSON files unchanged.`);
  process.exit(0);
}
// Never replace the initial safety record on repeated analysis.
try {
  await writeFile(hashFile, JSON.stringify(hashes, null, 2), { flag: 'wx' });
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
}
const refs = await readHumanReferences();
const folder = 'maps/愛スクリ～ム';
const project = JSON.parse(await readFile(`${folder}/project.json`, 'utf8'));
const aiEntry = project.namedDrafts.find((d) => d.name === 'AI版本');
const ai = JSON.parse(await readFile(`${folder}/${aiEntry.file}`, 'utf8'));
const human = refs.at(-1).chart;
function describe(chart) {
  const { bpm, anchorMs } = chart.tempoSegments[0],
    beatMs = 60000 / bpm;
  const counts = {},
    exposure = {},
    longs = [];
  for (const n of chart.notes) {
    const family = `${n.lane}:${n.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'hold') : 'tap'}`;
    counts[family] = (counts[family] ?? 0) + 1;
    if (n.kind === 'hold') {
      exposure[family] = (exposure[family] ?? 0) + (n.endTimeMs - n.timeMs) / beatMs;
      longs.push({
        family,
        startMs: n.timeMs,
        endMs: n.endTimeMs,
        startBar: +((n.timeMs - anchorMs) / beatMs / 4 + 1).toFixed(3),
        durationBeats: +((n.endTimeMs - n.timeMs) / beatMs).toFixed(3),
      });
    }
  }
  const bars = [];
  const end = chart.playRange?.endMs ?? chart.videoHint.durationMs;
  for (let beat = 0; anchorMs + beat * beatMs < end; beat += 16) {
    const start = anchorMs + beat * beatMs,
      stop = Math.min(end, start + 16 * beatMs);
    const active = chart.notes.filter(
      (n) => n.timeMs < stop && (n.kind === 'hold' ? n.endTimeMs > start : n.timeMs >= start),
    );
    bars.push({
      startBar: beat / 4 + 1,
      startMs: Math.round(start),
      endMs: Math.round(stop),
      notes: active.filter((n) => n.timeMs >= start).length,
      families: [
        ...new Set(
          active.map(
            (n) =>
              `${n.lane}:${n.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'hold') : 'tap'}`,
          ),
        ),
      ].sort(),
    });
  }
  return { notes: chart.notes.length, bpm, anchorMs, counts, exposureBeats: exposure, longs, bars };
}
const previous = JSON.parse(await readFile('src/fitness/bricks.json', 'utf8'));
await writeFile(`${out}/warehouse-before.json`, JSON.stringify(previous, null, 2), {
  flag: 'wx',
}).catch((e) => {
  if (e.code !== 'EEXIST') throw e;
});
const a = describe(ai),
  h = describe(human);
const result = {
  humanSources: refs.map((r) => ({ file: r.file, sha256: r.sha256, ...describe(r.chart) })),
  ai: {
    file: `${folder}/${aiEntry.file}`,
    sha256: createHash('sha256')
      .update(await readFile(`${folder}/${aiEntry.file}`))
      .digest('hex'),
    ...a,
  },
  comparison: h.bars.map((v, i) => ({
    ...v,
    aiFamilies: a.bars[i]?.families ?? [],
    aiNotes: a.bars[i]?.notes ?? 0,
  })),
  oldVocabulary: describe({
    ...human,
    notes: previous.bricks.flatMap((b) =>
      b.notes.map((n) => ({
        ...n,
        timeMs: (n.at * 60000) / 132,
        endTimeMs: ((n.at + (n.duration ?? 0)) * 60000) / 132,
      })),
    ),
  }).counts,
};
await writeFile(`${out}/audit.json`, JSON.stringify(result, null, 2));
await mkdir('docs/fitness', { recursive: true });
await writeFile(
  'docs/fitness/RETRAIN-2026-10-24.md',
  `# Fitness 重新学习：人工修订与 AI 对照\n\n状态：已冻结来源并完成第一轮差异审计；后续训练与验证记录追加于本文件。所有 maps 只读，原始哈希在 artifacts/fitness-retrain-2026-10-24/maps-before.json。\n\n人工来源白名单明确包含原三首与愛スクリ～ム的「人工版本」；「AI版本」「人工修订」以及当前工作草稿不会被自动混入。\n\n## 人工与 AI 的事实差异\n\n人工 ${h.notes} 个动作，AI ${a.notes} 个动作，BPM／锚点同为 ${h.bpm}／${h.anchorMs}ms。接近的音符总数掩盖了动作类型与持续负荷的差异，不能作为编排相似度。\n\n| 动作 | 人工数量 | AI数量 | 人工持续拍数 |\n|---|---:|---:|---:|\n${[...new Set([...Object.keys(h.counts), ...Object.keys(a.counts)])].map((k) => `|${k}|${h.counts[k] ?? 0}|${a.counts[k] ?? 0}|${(h.exposureBeats[k] ?? 0).toFixed(1)}|`).join('\n')}\n\n人工长动作：\n${h.longs.map((l) => `- ${l.family}：第 ${l.startBar} 小节／${(l.startMs / 1000).toFixed(3)}s 开始，持续 ${l.durationBeats} 拍。`).join('\n')}\n\n## 已定位的学习损失\n\n1. 提取器用 selected.length < 4 排除短音符数量的段落。持续 15／28／32 拍的单个 HOLD／SWAY 与一个回位音符只有1～2个记录，却是完整训练段落。\n2. 用单纯上下方向状态要求所有片段显式回站，排除了按长条时长结束的 Calf SWAY，以及连续 Squat HOLD→SWAY 的跨段姿态。\n3. 只按轨道组合选每类出现最多的前四个模板，未按 TAP／HOLD／SWAY 分层，稀有但关键的词汇再次被挤出。\n4. activity 只用音符条数估计，将长时间保持低估为低活动；生成器再按音符计数补轨，无法代表持续时间／负荷／恢复。\n5. 第四段就恢复等序号规则没有人工音乐依据；现有包络指纹不能识别人声、和声或主副歌。\n\n## 与音轨逐段对照的索引\n\n下表是人工动作事实，不是自动曲式标签。包含跨窗口仍在持续的长动作，不能只数起点。秒数为谱面时间；本曲偏移为0。\n\n|起始小节|时间s|人工动作族|AI动作族|人工／AI起点数|\n|---:|---:|---|---|---:|\n${result.comparison.map((v) => `|${v.startBar}|${(v.startMs / 1000).toFixed(2)}|${v.families.join(', ')}|${v.aiFamilies.join(', ')}|${v.notes}/${v.aiNotes}|`).join('\n')}\n\n完整统计、四首长动作和来源SHA256见 artifacts/fitness-retrain-2026-10-24/audit.json。下一步按时长与完整动作族重建积木，再提取音乐上下文进行按歌曲隔离的验证，不以同曲复现冒充泛化成功。\n`,
);
console.log(
  JSON.stringify(
    {
      humanNotes: h.notes,
      aiNotes: a.notes,
      humanLongs: h.longs,
      oldVocabulary: result.oldVocabulary,
    },
    null,
    2,
  ),
);
