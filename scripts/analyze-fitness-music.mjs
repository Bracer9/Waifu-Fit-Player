import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import path from 'node:path';

const load = async (file) =>
  import(
    'data:text/javascript;base64,' +
      Buffer.from(
        (await build({ entryPoints: [file], bundle: true, write: false, format: 'esm' }))
          .outputFiles[0].text,
      ).toString('base64')
  );
const { BpmEnvelope } = await load('src/bpm.ts');
const { phraseFingerprint, musicSimilarity, meanLevel } = await load('src/fitness/music.ts');
const legacyReport = process.argv.includes('--legacy-report');
const warehouseFile = legacyReport ? 'src/fitness/bricks.json' : 'src/fitness/bricks-study.json';
const warehouse = JSON.parse(await readFile(warehouseFile, 'utf8'));
const rows = [];
const pairs = [];
for (const reference of warehouse.references) {
  const chart = JSON.parse(await readFile(reference.file, 'utf8'));
  const folder = path.dirname(reference.file);
  const video = path.join(
    folder,
    (await readdir(folder)).find((f) => /\.mp4$/i.test(f)),
  );
  const result = spawnSync(
    process.env.WFP_FFMPEG ?? 'ffmpeg',
    ['-v', 'error', '-i', video, '-vn', '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'],
    { maxBuffer: 80 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(String(result.stderr) || 'ffmpeg unavailable');
  const audio = new Float32Array(
    result.stdout.buffer,
    result.stdout.byteOffset,
    result.stdout.byteLength / 4,
  );
  const env = new BpmEnvelope(audio.length / 16000);
  for (let i = 0; i < audio.length; i += 4096)
    env.push([audio.subarray(i, i + 4096)], 16000, i / 16000);
  const onsets = env.onsets(),
    levels = env.levels(),
    beatMs = 60000 / reference.bpm,
    offset = chart.videoOffsetMs ?? 0;
  const phrases = [];
  for (
    let beat = 0;
    reference.anchorMs - offset + (beat + 32) * beatMs < (levels.length / 200) * 1000;
    beat += 32
  ) {
    const start = reference.anchorMs - offset + beat * beatMs,
      end = start + 32 * beatMs;
    const selected = chart.notes.filter(
      (n) => n.timeMs >= start + offset - 2 && n.timeMs < end + offset - 2,
    );
    const normalized = selected.map((n) => [
      n.lane,
      n.direction,
      Math.round(((n.timeMs - start - offset) / beatMs) * 4) / 4,
      n.kind,
      n.kind === 'hold' ? Math.round(((n.endTimeMs - n.timeMs) / beatMs) * 4) / 4 : 0,
      n.armAction ?? '',
      n.hand ?? '',
    ]);
    const mirror = normalized.map((n) => [
      n[0],
      {
        left: 'right',
        right: 'left',
        up_left: 'up_right',
        up_right: 'up_left',
        down_left: 'down_right',
        down_right: 'down_left',
      }[n[1]] ?? n[1],
      ...n.slice(2, 6),
      n[6] === 'left' ? 'right' : n[6] === 'right' ? 'left' : n[6],
    ]);
    phrases.push({
      startBar: beat / 4 + 1,
      startMs: Math.round(start),
      endMs: Math.round(end),
      notes: selected.length,
      signature: JSON.stringify(normalized),
      mirror: JSON.stringify(mirror),
      fingerprint: phraseFingerprint(onsets, levels, start, end, 200),
      energy: meanLevel(levels, start, end, 200),
    });
  }
  for (let i = 0; i < phrases.length; i++)
    for (let j = i + 1; j < phrases.length; j++) {
      const a = phrases[i],
        b = phrases[j];
      if (a.notes < 4 || b.notes < 4) continue;
      pairs.push({
        song: reference.title,
        bars: [a.startBar, b.startBar],
        musicSimilarity: Math.round(musicSimilarity(a.fingerprint, b.fingerprint) * 1000) / 1000,
        movement:
          a.signature === b.signature
            ? 'repeat'
            : a.signature === b.mirror
              ? 'mirror'
              : 'different',
      });
    }
  const profile = [];
  for (const brick of warehouse.bricks) {
    const matches = brick.sources.filter((s) => s.title === reference.title);
    for (const source of matches) {
      const start = source.startMs - offset,
        end = source.endMs - offset;
      profile.push({ brickId: brick.id, energy: meanLevel(levels, start, end, 200) });
    }
  }
  const sorted = profile.map((p) => p.energy).sort((a, b) => a - b);
  for (const p of profile) {
    const brick = warehouse.bricks.find((b) => b.id === p.brickId);
    brick.musicSamples ??= [];
    brick.musicSamples.push({
      song: reference.title,
      energyRank: sorted.filter((v) => v <= p.energy).length / (sorted.length || 1),
    });
  }
  rows.push({
    title: reference.title,
    phrases: phrases.map(({ signature, mirror, fingerprint, ...p }) => p),
  });
}
for (const brick of warehouse.bricks) {
  const samples = brick.musicSamples ?? [];
  brick.musicProfile = {
    energyRank: samples.reduce((s, v) => s + v.energyRank, 0) / (samples.length || 1),
    observations: samples.length,
  };
  delete brick.musicSamples;
}
const related = pairs.filter((p) => p.movement !== 'different');
const repeatedMusic = pairs.filter((p) => p.musicSimilarity >= 0.88);
const study = {
  version: 1,
  windowBars: 8,
  repeatSimilarityThreshold: 0.88,
  references: rows,
  pairs: pairs.sort((a, b) => b.musicSimilarity - a.musicSimilarity),
  summary: {
    pairs: pairs.length,
    repeatedOrMirroredMovement: related.length,
    strongMusicMatches: repeatedMusic.length,
    strongMatchesWithRepeatedOrMirroredMovement: repeatedMusic.filter(
      (p) => p.movement !== 'different',
    ).length,
  },
};
if (!legacyReport) await writeFile(warehouseFile, JSON.stringify(warehouse, null, 2) + '\n');
await writeFile(
  legacyReport ? 'docs/fitness/music-study.json' : 'docs/fitness/music-study-v3.json',
  JSON.stringify(study, null, 2) + '\n',
);
await writeFile(
  'src/fitness/music-rules.json',
  JSON.stringify({ version: 1, repeatSimilarityThreshold: 0.88 }, null, 2) + '\n',
);
await writeFile(
  legacyReport ? 'docs/fitness/MUSIC-RELATION.md' : 'docs/fitness/MUSIC-RELATION-V3.md',
  `# 音乐与 Fitness 编排的关系\n\n${warehouse.references.length}首音轨只读解码，按人工 BPM／锚点对齐 8 小节窗口，比较起音节奏及音量变化的归一化指纹，同时比较同区间人工动作序列的完全重复与左右镜像。它不识别旋律或歌词，不能据此直接宣布主歌／副歌。${legacyReport ? '' : '本页仅是重新学习的一项包络对照，不代替曲式／频谱／持续负荷的复合分析，也未接入正式生成器。'}\n\n${JSON.stringify(study.summary, null, 2)}\n\n## 最相似的段落对\n\n| 曲目 | 起始小节对 | 音乐相似度 | 动作关系 |\n|---|---|---:|---|\n` +
    study.pairs
      .slice(0, 20)
      .map((p) => `| ${p.song} | ${p.bars.join(' / ')} | ${p.musicSimilarity} | ${p.movement} |`)
      .join('\n') +
    `\n\n完整片段能量、所有配对证据见 [分析数据](${legacyReport ? 'music-study.json' : 'music-study-v3.json'})。积木的音乐能量分位特征保存在 ${legacyReport ? 'bricks.json' : 'bricks-study.json'} 的 musicProfile。\n\n## 对照结论\n\n- 相似音乐不等于必须相同动作，重复和镜像的反例必须保留；0.88是旧启发式阈值，不是已校准的通用准确率。\n- 不能用四轨占比、八小节切窗或包络相关度代替结构与负荷规划。\n- 本表的different只指序列非完全一致，不代表人工编排质量差；相似度不能直接判断主副歌。\n`,
);
console.log(JSON.stringify(study.summary));
