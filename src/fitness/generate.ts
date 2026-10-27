import warehouse from './bricks.json';
import musicRules from './music-rules.json';
import { fitnessPatterns, stampPattern, type FitnessPattern } from './patterns';
import { planFitnessPhrases, planFitnessDynamics } from './structure';
import { musicSimilarity, phraseFingerprint } from './music';
import { ENVELOPE_RATE } from '../bpm';
import { parseChart, sortChart, type Chart, type Note, type Lane } from '../model';
export type FitnessSection = {
  startMs: number;
  endMs: number;
  brickId: string;
  label: string;
  repeats: number;
  mirrored: boolean;
  energy: number;
  musicMatch?: { section: number; similarity: number; reused: boolean };
};
export type FitnessReport = {
  version: 2;
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
  rests: { startMs: number; endMs: number; reason: 'quiet' | 'phrase-fit' }[];
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
// The fastest approved reference squat alternates at 120 BPM: 500 ms per transition.
// A faster song must use a sparser brick, rather than accelerate that movement.
const MIN_SQUAT_TRANSITION_MS = 500;
function fitsSquatCadence(pattern: FitnessPattern, beatMs: number) {
  const beats = pattern.notes
    .filter((n) => n.lane === 'squat')
    .map((n) => n.at)
    .sort((a, b) => a - b);
  return beats.every((beat, i) => {
    const next = beats[i + 1] ?? beats[0] + pattern.beats;
    return (next - beat) * beatMs >= MIN_SQUAT_TRANSITION_MS;
  });
}
/** Deterministic assembly of observed, complete movement phrases. No video-pose inference. */
export function generateFitness(
  base: Chart,
  onsets: Float32Array,
  levels: Float32Array,
  rate = ENVELOPE_RATE,
  progress: (value: number, phase: string) => void = () => {},
): FitnessResult {
  if (base.tempoSegments.length !== 1 || base.tempoSegments[0].meter !== '4/4')
    throw new Error('一键 FITNESS 目前仅支持一个 4/4 节拍段；请先核对已填写的节拍段。');
  const { bpm, anchorMs } = base.tempoSegments[0];
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(anchorMs) || anchorMs < 0)
    throw new Error('请先在节拍段填写有效的 BPM 和 Offset（0 ms 也有效）。');
  if (onsets.length !== levels.length || onsets.length < rate * 16)
    throw new Error('音轨太短，至少需要 16 秒音乐。');
  progress(68, '使用已填写的 BPM 和 Offset');
  const offset = base.videoOffsetMs ?? 0;
  const rangeStart = Math.max(0, base.playRange?.startMs ?? 0);
  const rangeEnd = Math.min(
    base.videoHint.durationMs,
    base.playRange?.endMs ?? Infinity,
    (onsets.length / rate) * 1000,
  );
  const startBin = Math.floor((rangeStart / 1000) * rate),
    endBin = Math.floor((rangeEnd / 1000) * rate);
  const barMs = (60000 / bpm) * 4;
  const gridStartMs = anchorMs - offset;
  // A cropped play range starts on the next bar of the supplied grid, never a new detected grid.
  const audioStartMs =
    gridStartMs + Math.max(0, Math.ceil((rangeStart - gridStartMs) / barMs - 1e-9)) * barMs;
  const generationStartMs = audioStartMs + offset;
  progress(76, '按已填节拍网格分析音乐区间');
  const sortedLevels = levels.slice(startBin, endBin).sort();
  if (!sortedLevels.length || sortedLevels.at(-1)! <= 0.00001)
    throw new Error('游玩区间没有有效音频，原谱面未修改。');
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
  const library = fitnessPatterns.filter(
    (b) =>
      fitsSquatCadence(b, movementBeatMs) &&
      b.notes.every(
        (n) => n.at < b.beats && (n.kind !== 'hold' || (n.duration ?? 0) * movementBeatMs <= 15000),
      ),
  );
  const notes: Note[] = [],
    sections: FitnessSection[] = [];
  const rests: FitnessReport['rests'] = [];
  const counts: Record<string, number> = Object.fromEntries(FOUR_LANES.map((l) => [l, 0]));
  const usage = new Map<string, number>();
  const fingerprints: { values: number[]; beats: number }[] = [];
  const boundaries = planFitnessPhrases(
    onsets,
    levels,
    audioStartMs,
    beatMs,
    finalBeat * pace,
    rate,
  ).map((b) => ({ ...b, beat: b.beat / pace }));
  const dynamics = planFitnessDynamics(
    onsets,
    levels,
    audioStartMs,
    movementBeatMs,
    finalBeat,
    rate,
  );
  const leaveRest = (start: number, end: number, reason: 'quiet' | 'phrase-fit') => {
    const startMs = Math.round(audioStartMs + start * movementBeatMs);
    const endMs = Math.round(audioStartMs + end * movementBeatMs);
    const previous = rests.at(-1);
    if (previous?.endMs === startMs && previous.reason === reason) previous.endMs = endMs;
    else rests.push({ startMs, endMs, reason });
  };
  const referenceWeights = Object.fromEntries(
    CORE_LANES.map((l) => [
      l,
      warehouse.references.reduce(
        (sum, r) => sum + (r.laneCounts[l as keyof typeof r.laneCounts] ?? 0),
        0,
      ),
    ]),
  );
  const sideBudget = Math.floor(((boundaries.at(-1)!.beat - boundaries[0].beat) * 0.08) / 4) * 4;
  let sideUsed = 0,
    lastSideEnd = -Infinity,
    lastSquatMs = -Infinity;
  for (let phrase = 0; phrase + 1 < boundaries.length; phrase++) {
    let cursor = boundaries[phrase].beat;
    const phraseEnd = boundaries[phrase + 1].beat;
    while (cursor < phraseEnd) {
      let available = phraseEnd - cursor;
      const dynamic = dynamics[Math.floor(cursor)];
      let dynamicEnd = cursor + 1;
      while (dynamicEnd < phraseEnd && dynamics[Math.floor(dynamicEnd)]?.mode === dynamic.mode)
        dynamicEnd++;
      if (dynamic.mode === 'rest') {
        leaveRest(cursor, dynamicEnd, 'quiet');
        cursor = dynamicEnd;
        continue;
      }
      available = Math.min(available, dynamicEnd - cursor);
      const energy = dynamic.energy;
      const recovery = dynamic.mode === 'light';
      const sideEligible =
        !recovery &&
        energy >= 0.65 &&
        cursor >= 64 &&
        cursor - lastSideEnd >= 96 &&
        sideBudget - sideUsed >= 8;
      // A short, infrequent accent; Side Crunch is never a recovery filler or a coverage quota.
      const sideWanted =
        sideEligible &&
        library.some(
          (b) =>
            b.lanes.includes('side_crunch') &&
            b.beats * (b.mirrorRequired ? 2 : 1) <= Math.min(8, available),
        );
      if (sideWanted) available = Math.min(8, available);
      const startMs = audioStartMs + cursor * movementBeatMs;
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
              (a, b) => counts[a] / referenceWeights[a] - counts[b] / referenceWeights[b],
            )[0];
      const previous = sections.at(-1);
      const candidates = library.filter((b) => {
        const unit = b.beats * (b.mirrorRequired ? 2 : 1);
        const firstSquatBeat = Math.min(
          ...b.notes.filter((n) => n.lane === 'squat').map((n) => n.at),
        );
        const firstSquatMs = Math.round(
          generationStartMs + (cursor + firstSquatBeat) * movementBeatMs,
        );
        return (
          unit <= available &&
          (!recovery || (b.lanes.length === 1 && b.lanes[0] === 'punch' && b.activity <= 0.25)) &&
          firstSquatMs - lastSquatMs >= MIN_SQUAT_TRANSITION_MS &&
          (sections.length > 0 || !b.lanes.includes('squat')) &&
          (sideWanted ? b.lanes.includes('side_crunch') : !b.lanes.includes('side_crunch')) &&
          // Do not leave a partial mirrored group or a whole silent bar at the next change.
          (available % unit === 0 || available - Math.floor(available / unit) * unit >= 4)
        );
      });
      const ranked = candidates
        .map((b) => {
          const repeated = match && sections[match.index].brickId === b.id;
          const unit = b.beats * (b.mirrorRequired ? 2 : 1);
          const score =
            (b.lanes.includes(target) ? 0.35 : 0) -
            Math.abs(b.activity - (recovery ? 0.2 : 0.15 + energy * 0.25)) * 8 +
            Math.min(0.35, b.sources.length * 0.03) +
            (b.lanes.length === 2 && energy >= 0.65 ? 0.3 : 0) -
            (previous?.brickId === b.id && !repeated ? 2 : 0) -
            Math.min(0.35, (usage.get(b.id) ?? 0) * 0.05) -
            Math.abs(b.musicProfile.energyRank - energy) * 0.6 +
            (available % unit === 0 ? 0.5 : 0) +
            (repeated ? 2.5 * match.similarity : 0);
          return { brick: b, score };
        })
        .sort((a, b) => b.score - a.score || a.brick.id.localeCompare(b.brick.id));
      const brick = ranked[0]?.brick;
      if (!brick) {
        leaveRest(cursor, cursor + available, 'phrase-fit');
        cursor += available;
        continue;
      }
      let repeats = Math.floor(available / brick.beats);
      if (brick.mirrorRequired) repeats -= repeats % 2;
      const start = cursor;
      const stamped = stampPattern(
        brick,
        generationStartMs + cursor * movementBeatMs,
        movementBeatMs,
        repeats,
      );
      notes.push(...stamped);
      for (const note of stamped) {
        counts[note.lane]++;
        if (note.lane === 'squat') lastSquatMs = Math.max(lastSquatMs, note.timeMs);
      }
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
      notes,
    }),
  );
  progress(98, '校验谱面与生成完成报告');
  return {
    chart,
    report: {
      version: 2,
      bpm,
      anchorMs,
      audioStartMs,
      endMs,
      noteCount: notes.length,
      laneCounts: counts,
      sections,
      rests,
      boundaries: boundaries.map((b) => ({
        ...b,
        beat: b.beat * pace,
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
        '使用当前谱面已填写的 BPM 和 Offset，未自动检测或校正。',
        '这是基于三首参考谱的规则生成草稿，尚未经过教练逐段验收。',
        '规则分段和动作组不是已识别的 Aメロ／Bメロ／副歌，需核对真实乐段。',
        ...(pace > 1 ? ['动作使用半速节奏，音乐 BPM 保持不变。'] : []),
      ],
      warehouseVersion: warehouse.version,
      referenceTitles: warehouse.references.map((r) => r.title),
    },
  };
}
