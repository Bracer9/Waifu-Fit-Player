import warehouse from './bricks-study.json';
import musicRules from './music-rules.json';
import { normalizeFitnessPattern, stampPattern } from './patterns';
const fitnessPatterns = warehouse.bricks.map(normalizeFitnessPattern);
import { planFitnessPhrases } from './structure';
import { meanLevel, musicSimilarity, phraseFingerprint } from './music';
import { analyzeTempo, ENVELOPE_RATE } from '../bpm';
import { estimateFirstBeat } from '../first-beat';
import { parseChart, sortChart, type Chart, type Note, type Lane } from '../model';
import { movementModes, movementExposure } from './movement';
import { musicContext } from './context';
import { matchMovement, type ContextModel } from './learning';
import type { MusicSpectrumData } from './spectrum';

export type AnalyzedMusicSection = { startMs: number; endMs: number; label: string };
export type FitnessLearningOptions = {
  spectrum?: MusicSpectrumData;
  /** Experimental local-model predictions. Never fabricate these from volume. */
  structure?: AnalyzedMusicSection[];
  contextModel?: ContextModel;
};
const functionalLabels = ['intro', 'verse', 'chorus', 'inst', 'bridge', 'outro', 'silence'];

export type FitnessSection = {
  startMs: number;
  endMs: number;
  brickId: string;
  label: string;
  repeats: number;
  mirrored: boolean;
  energy: number;
  modes: string[];
  sustainedBeats: Record<string, number>;
  musicFunction?: string;
  learnedEvidence?: ReturnType<typeof matchMovement>;
  musicMatch?: { section: number; similarity: number; reused: boolean };
};
export type FitnessReport = {
  version: 3;
  structureSource: 'provided-model-predictions' | 'acoustic-only';
  boundaries: { beat: number; startMs: number; strength: number; reason: string }[];
  sideCrunch: {
    usedBeats: number;
    budgetBeats: number;
    maxBoutBeats: number;
    cooldownBeats: number;
  };
  bpm: number;
  anchorMs: number;
  audioStartMs: number;
  endMs: number;
  noteCount: number;
  laneCounts: Record<string, number>;
  sections: FitnessSection[];
  musicRepeats: { startMs: number; previousMs?: number; beats: number; similarity: number }[];
  warnings: string[];
  warehouseVersion: number;
  referenceTitles: string[];
};
export type FitnessResult = { chart: Chart; report: FitnessReport };
export type FitnessMessage =
  { progress: number; phase: string } | { result: FitnessResult } | { error: string };
const FOUR_LANES: Lane[] = ['squat', 'punch', 'calf_raise', 'side_crunch'];
const CORE_LANES: Lane[] = ['squat', 'punch', 'calf_raise'];
/** Deterministic assembly of observed, complete movement phrases. No video-pose inference. */
export function generateFitness(
  base: Chart,
  onsets: Float32Array,
  levels: Float32Array,
  rate = ENVELOPE_RATE,
  progress: (value: number, phase: string) => void = () => {},
  learning: FitnessLearningOptions = {},
): FitnessResult {
  if (onsets.length !== levels.length || onsets.length < rate * 16)
    throw new Error('音轨太短，至少需要 16 秒稳定音乐。');
  progress(68, '确认全曲节拍一致性');
  const offset = base.videoOffsetMs ?? 0;
  const rangeStart = Math.max(0, base.playRange?.startMs ?? 0);
  const rangeEnd = Math.min(
    base.videoHint.durationMs,
    base.playRange?.endMs ?? Infinity,
    (onsets.length / rate) * 1000,
  );
  const startBin = Math.floor((rangeStart / 1000) * rate),
    endBin = Math.floor((rangeEnd / 1000) * rate);
  const analysis = analyzeTempo(onsets.subarray(startBin, endBin), rate);
  if (analysis.kind === 'varying')
    throw new Error(
      `检测到可能变速／节奏歧义（${analysis.bpms.join(' / ')} BPM），暂不自动拼接。请先分段核对；原谱面未修改。`,
    );
  if (analysis.kind !== 'stable') throw new Error('无法确认稳定 BPM，原谱面未修改。');
  // Snap only near-integer estimates, avoiding artificial long-song grid drift.
  const rawBpm = analysis.result.bpm;
  const bpm = Math.abs(rawBpm - Math.round(rawBpm)) <= 0.08 ? Math.round(rawBpm) : rawBpm;
  progress(76, '定位起始拍点与音频区间');
  const first = estimateFirstBeat(
    onsets.subarray(startBin, Math.min(endBin, startBin + rate * 60)),
    bpm,
    rate,
  );
  if (!first)
    throw new Error(`已找到 ${bpm} BPM，但无法可靠定位起点；原谱面未修改，请先人工核对。`);
  const audioStartMs = Math.round(rangeStart + first.timeMs);
  const anchorMs = Math.round(audioStartMs + offset);
  const sortedLevels = levels.slice(startBin, endBin).sort();
  const audible = Math.max(0.00001, sortedLevels[Math.floor(sortedLevels.length * 0.9)] * 0.025);
  let last = endBin - 1;
  while (last > startBin && levels[last] < audible) last--;
  const endMs = Math.min(rangeEnd, Math.round(((last + 1) / rate) * 1000 + 150));
  const beatMs = 60000 / bpm;
  // At very high tempos use a half-speed movement grid, without changing the music BPM.
  const pace = bpm > 180 ? 2 : 1;
  const movementBeatMs = beatMs * pace;
  const finalBeat = Math.floor((endMs - audioStartMs) / movementBeatMs) - 4;
  if (finalBeat < 24) throw new Error('有效音乐区间不足以放入完整的健身动作组。');
  const library = fitnessPatterns.filter((b) =>
    b.notes.every(
      (n) => n.at < b.beats && (n.kind !== 'hold' || (n.duration ?? 0) * movementBeatMs <= 15000),
    ),
  );
  const notes: Note[] = [],
    sections: FitnessSection[] = [];
  const counts: Record<string, number> = Object.fromEntries(FOUR_LANES.map((l) => [l, 0]));
  const usage = new Map<string, number>();
  const fingerprints: { values: number[]; beats: number }[] = [];
  let boundaries = planFitnessPhrases(
    onsets,
    levels,
    audioStartMs,
    movementBeatMs,
    finalBeat,
    rate,
  );
  if (learning.structure?.length) {
    // LinkSeg boundaries lie between beats. Snap in the track's grid, retain
    // short/odd phrases, and never move every following section by that error.
    const lastBeat = Math.floor(finalBeat / 4) * 4;
    const starts = [
      ...new Set([
        0,
        lastBeat,
        ...learning.structure
          .flatMap((s) => [s.startMs, s.endMs])
          .map((t) => Math.round((t - audioStartMs) / movementBeatMs / 4) * 4)
          .filter((b) => b >= 0 && b <= lastBeat),
      ]),
    ].sort((a, b) => a - b);
    const filled = starts.flatMap((b, i) =>
      i + 1 < starts.length
        ? Array.from({ length: Math.ceil((starts[i + 1] - b) / 32) }, (_, j) => b + j * 32)
        : [b],
    );
    boundaries = filled.map((beat, i) => ({
      beat,
      strength: 1,
      reason: i === 0 ? 'opening' : i === filled.length - 1 ? 'end' : 'change',
    }));
  }
  const energies = boundaries
    .slice(0, -1)
    .map((boundary, i) =>
      meanLevel(
        levels,
        audioStartMs + boundary.beat * movementBeatMs,
        audioStartMs + boundaries[i + 1].beat * movementBeatMs,
        rate,
      ),
    );
  const referenceWeights = Object.fromEntries(
    CORE_LANES.map((l) => [
      l,
      warehouse.references.reduce(
        (sum, r) => sum + (r.laneWorkBeats[l as keyof typeof r.laneWorkBeats] ?? 0),
        0,
      ),
    ]),
  );
  const sideBudget = Math.floor(((boundaries.at(-1)!.beat - boundaries[0].beat) * 0.08) / 4) * 4;
  let sideUsed = 0,
    lastSideEnd = -Infinity;
  const occupied: Record<string, number> = Object.fromEntries(CORE_LANES.map((l) => [l, 0]));
  for (let phrase = 0; phrase + 1 < boundaries.length; phrase++) {
    let cursor = boundaries[phrase].beat;
    const phraseEnd = boundaries[phrase + 1].beat;
    while (cursor < phraseEnd) {
      let available = phraseEnd - cursor;
      // Sustained squat is load even when represented by one note. Recover
      // from the actual preceding load; there is no every-fourth-section rule.
      const previousStatic = sections.at(-1)?.sustainedBeats['squat:hold'] ?? 0;
      const sideEligible = cursor >= 64 && cursor - lastSideEnd >= 96 && sideBudget - sideUsed >= 8;
      const startMs = audioStartMs + cursor * movementBeatMs;
      const currentEnergy = meanLevel(levels, startMs, startMs + available * movementBeatMs, rate);
      const energy = energies.filter((e) => e <= currentEnergy).length / (energies.length || 1);
      const endOfCandidate = startMs + available * movementBeatMs;
      const functionOccupancy = functionalLabels.map(
        (label) =>
          (learning.structure ?? [])
            .filter((s) => s.label === label)
            .reduce(
              (sum, s) =>
                sum + Math.max(0, Math.min(endOfCandidate, s.endMs) - Math.max(startMs, s.startMs)),
              0,
            ) /
            (endOfCandidate - startMs) || 0,
      );
      const context = learning.contextModel
        ? musicContext(
            onsets,
            levels,
            learning.spectrum,
            startMs,
            endOfCandidate,
            movementBeatMs,
            rate,
          )
        : undefined;
      const learnedEvidence =
        learning.contextModel && context
          ? matchMovement(
              {
                ...context,
                values: [...context.values, ...functionOccupancy.map((v) => v * 2)],
              },
              available,
              learning.contextModel,
            )
          : undefined;
      const fingerprint = phraseFingerprint(
        onsets,
        levels,
        startMs,
        startMs + available * movementBeatMs,
        rate,
      );
      const match = fingerprints
        .map((f, index) => ({
          index,
          similarity: f.beats === available ? musicSimilarity(f.values, fingerprint) : 0,
        }))
        .filter((m) => m.similarity >= musicRules.repeatSimilarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)[0];
      const target =
        sections.length === 0
          ? 'punch'
          : [...CORE_LANES].sort(
              (a, b) => occupied[a] / referenceWeights[a] - occupied[b] / referenceWeights[b],
            )[0];
      const previous = sections.at(-1);
      const candidates = library.filter((b) => {
        const unit = b.beats * (b.mirrorRequired ? 2 : 1);
        return (
          unit <= available &&
          (!b.lanes.includes('side_crunch') || (sideEligible && unit <= 8)) &&
          // Do not leave a partial mirrored group or a whole silent bar at the next change.
          (available % unit === 0 || available - Math.floor(available / unit) * unit >= 4)
        );
      });
      const ranked = candidates
        .map((b) => {
          const repeated = match && sections[match.index].brickId === b.id;
          const unit = b.beats * (b.mirrorRequired ? 2 : 1);
          const score =
            (b.lanes.includes(target) ? 2 : 0) -
            Math.abs(b.activity - (0.25 + energy * 0.35)) * 2 +
            Math.min(0.35, b.sources.length * 0.03) +
            (b.lanes.length === 2 ? 0.3 : 0) -
            (previous?.brickId === b.id && !repeated ? 2 : 0) -
            (usage.get(b.id) ?? 0) * 0.35 -
            Math.abs(b.musicProfile.energyRank - energy) * 0.6 +
            (available % unit === 0 ? 1.5 : 0) +
            (repeated ? 2.5 * match.similarity : 0) +
            (learnedEvidence
              ? 8 * (learnedEvidence.families[movementModes(b.notes).join('+')] ?? 0)
              : 0) -
            (previousStatic >= 12 &&
            b.notes.some((n) => n.lane === 'squat' && n.kind === 'hold' && n.modifier === 'none')
              ? 4
              : 0) -
            (b.lanes.includes('side_crunch') ? 1 : 0) +
            (learnedEvidence ? 4 * (learnedEvidence.bricks[b.id] ?? 0) : 0);
          return { brick: b, score };
        })
        .sort((a, b) => b.score - a.score || a.brick.id.localeCompare(b.brick.id));
      const brick = ranked[0]?.brick;
      if (!brick) throw new Error('当前段落不能容纳完整动作组，未写入不完整谱面。');
      let repeats = Math.floor(
        (brick.lanes.includes('side_crunch') ? Math.min(8, available) : available) / brick.beats,
      );
      if (brick.mirrorRequired) repeats -= repeats % 2;
      const start = cursor;
      const stamped = stampPattern(
        brick,
        anchorMs + cursor * movementBeatMs,
        movementBeatMs,
        repeats,
      );
      notes.push(...stamped);
      for (const note of stamped) counts[note.lane]++;
      for (const note of stamped)
        occupied[note.lane] =
          (occupied[note.lane] ?? 0) +
          (note.kind === 'hold' ? (note.endTimeMs - note.timeMs) / movementBeatMs : 2);
      cursor += brick.beats * repeats;
      if (brick.lanes.includes('side_crunch')) {
        sideUsed += cursor - start;
        lastSideEnd = cursor;
      }
      usage.set(brick.id, (usage.get(brick.id) ?? 0) + 1);
      sections.push({
        startMs: Math.round(startMs),
        endMs: Math.round(audioStartMs + cursor * movementBeatMs),
        brickId: brick.id,
        label: brick.label,
        repeats,
        mirrored: brick.mirrorRequired,
        energy: Math.round(energy * 100) / 100,
        modes: movementModes(brick.notes),
        sustainedBeats: Object.fromEntries(
          Object.entries(movementExposure(brick.notes, brick.beats)).map(([mode, beats]) => [
            mode,
            beats * repeats,
          ]),
        ),
        ...(learning.structure?.length
          ? {
              musicFunction:
                functionalLabels[functionOccupancy.indexOf(Math.max(...functionOccupancy))],
            }
          : {}),
        ...(learnedEvidence ? { learnedEvidence } : {}),
        ...(match
          ? {
              musicMatch: {
                section: match.index + 1,
                similarity: Math.round(match.similarity * 1000) / 1000,
                reused: sections[match.index].brickId === brick.id,
              },
            }
          : {}),
      });
      fingerprints.push({
        values:
          cursor - start === available
            ? fingerprint
            : phraseFingerprint(
                onsets,
                levels,
                startMs,
                audioStartMs + cursor * movementBeatMs,
                rate,
              ),
        beats: cursor - start,
      });
      progress(80 + Math.round((cursor / finalBeat) * 15), '按音乐换段拼接完整动作组');
    }
  }
  if (!notes.length) throw new Error('有效区间无法容纳完整训练，未写入不完整谱面。');
  const chart = parseChart(
    sortChart({
      ...base,
      chartType: 'fitness',
      intensity: 'medium',
      danceDifficulty: undefined,
      playRange: { startMs: rangeStart, endMs },
      specialMove: null,
      specialEvents: [],
      tempoSegments: [{ id: crypto.randomUUID(), anchorMs, bpm, meter: '4/4' }],
      notes,
    }),
  );
  progress(98, '校验谱面与生成完成报告');
  return {
    chart,
    report: {
      version: 3,
      structureSource: learning.structure?.length ? 'provided-model-predictions' : 'acoustic-only',
      bpm,
      anchorMs,
      audioStartMs,
      endMs,
      noteCount: notes.length,
      laneCounts: counts,
      sections,
      boundaries: boundaries.map((b) => ({
        ...b,
        startMs: Math.round(audioStartMs + b.beat * movementBeatMs),
      })),
      sideCrunch: {
        usedBeats: sideUsed,
        budgetBeats: sideBudget,
        maxBoutBeats: 8,
        cooldownBeats: 96,
      },
      musicRepeats: sections.flatMap((s) =>
        s.musicMatch
          ? [
              {
                startMs: s.startMs,
                previousMs: sections[s.musicMatch.section - 1].startMs,
                beats: Math.round((s.endMs - s.startMs) / movementBeatMs),
                similarity: s.musicMatch.similarity,
              },
            ]
          : [],
      ),
      warnings: [
        '起点是自动拍点候选，音乐小节第一强拍仍需试听核对。',
        '基于四首人工参考的编排草稿，音乐相似不代表应当选相同动作，尚未经过逐段验收。',
        learning.structure?.length
          ? '曲式标签为模型候选，尚不能识别 Bメロ或人声入场。'
          : '当前浏览器生成未接入曲式模型，不具备主副歌／Bメロ／人声入场识别。',
        ...(pace > 1 ? ['动作使用半速节奏，音乐 BPM 保持不变。'] : []),
      ],
      warehouseVersion: warehouse.version,
      referenceTitles: warehouse.references.map((r) => r.title),
    },
  };
}
