/** Experimental sequence planner; deliberately not imported by the game worker. */
import warehouse from './bricks-study.json';
import { normalizeFitnessPattern, stampPattern, type FitnessPattern } from './patterns';
import {
  movementCell,
  phraseFeatures,
  predictMovementCell,
  type PhraseModel,
  type MovementCell,
  PLAN_MODES,
} from './phrase-learning';
import { generateFitness, type AnalyzedMusicSection } from './retraining';
import type { MusicSpectrumData } from './spectrum';
import { parseChart, sortChart, type Chart, type Note } from '../model';

type Edge = {
  pattern: FitnessPattern | null;
  repeats: number;
  bars: number;
  cells: MovementCell[];
  side: boolean;
  longSquat: number;
  closed: boolean;
};
type State = {
  cost: number;
  at: number;
  previous?: State;
  edge?: Edge;
  sideBeats: number;
  lastSideEnd: number;
  squatStreak: number;
};
export function planPhraseFitness(
  base: Chart,
  onsets: Float32Array,
  levels: Float32Array,
  spectrum: MusicSpectrumData,
  structure: AnalyzedMusicSection[],
  model: PhraseModel,
) {
  const tempo = generateFitness(base, onsets, levels),
    beatMs = (60000 / tempo.report.bpm) * (tempo.report.bpm > 180 ? 2 : 1),
    origin = tempo.report.audioStartMs;
  const bars = Math.floor((tempo.report.endMs - origin) / beatMs / 4) - 1;
  const predicted = Array.from({ length: bars }, (_, i) =>
    predictMovementCell(
      phraseFeatures(onsets, levels, spectrum, structure, origin + i * 4 * beatMs, beatMs),
      model,
    ),
  );
  const edges: Edge[] = [];
  for (const p of warehouse.bricks.map(normalizeFitnessPattern)) {
    if (
      p.notes.some(
        (n) => n.at >= p.beats || (n.kind === 'hold' && (n.duration ?? 0) * beatMs > 15000),
      )
    )
      continue;
    for (const repeats of p.mirrorRequired ? [2, 4, 8] : [1, 2, 4, 8]) {
      const length = p.beats * repeats;
      if (length > 32) continue;
      const side = p.lanes.includes('side_crunch');
      if (side && length > 8) continue;
      const notes = stampPattern(p, 0, beatMs, repeats);
      const cells = Array.from({ length: length / 4 }, (_, i) =>
        movementCell(notes, i * 4 * beatMs, (i + 1) * 4 * beatMs, beatMs),
      );
      const lastSquat = notes.filter((n) => n.lane === 'squat').at(-1);
      const longSquat = notes
        .filter((n) => n.lane === 'squat' && n.kind === 'hold')
        .reduce((sum, n) => sum + (n.kind === 'hold' ? (n.endTimeMs - n.timeMs) / beatMs : 0), 0);
      edges.push({
        pattern: p,
        repeats,
        bars: length / 4,
        cells,
        side,
        longSquat,
        closed: !lastSquat || lastSquat.direction === 'up',
      });
    }
  }
  const standingRest: MovementCell = {
    presence: PLAN_MODES.map(() => 0),
    held: PLAN_MODES.map(() => 0),
    tapDensity: 0,
    rest: 1,
    left: 0,
    right: 0,
  };
  edges.push({
    pattern: null,
    repeats: 1,
    bars: 1,
    cells: [standingRest],
    side: false,
    longSquat: 0,
    closed: true,
  });
  const sideBudget = Math.floor((bars * 4 * 0.08) / 4) * 4;
  const starts = new Set(
    structure.slice(1).map((s) => Math.round((s.startMs - origin) / beatMs / 4)),
  );
  const cache = new Map<string, number>();
  function mismatch(at: number, edge: Edge) {
    const key = `${at}:${edge.pattern?.id ?? 'rest'}:${edge.repeats}`;
    const old = cache.get(key);
    if (old !== undefined) return old;
    let score = 0;
    for (let j = 0; j < edge.bars; j++) {
      const a = edge.cells[j],
        b = predicted[at + j];
      score +=
        5 * a.presence.reduce((sum, v, i) => sum + (v - b.presence[i]) ** 2, 0) +
        4 * a.held.reduce((sum, v, i) => sum + (v - b.held[i]) ** 2, 0) +
        1.5 * (a.tapDensity - b.tapDensity) ** 2 +
        6 * (a.rest - b.rest) ** 2;
      // Hand counts are a weak local cue; whole mirrored groups remain intact.
      score += 0.08 * ((a.left - b.left) ** 2 + (a.right - b.right) ** 2);
      if (j && starts.has(at + j)) score += 0.3;
    }
    score += 0.05; // Prefer a complete learned group over gratuitous fragmentation.
    cache.set(key, score);
    return score;
  }
  const beam: State[][] = Array.from({ length: bars + 1 }, () => []);
  beam[0] = [{ cost: 0, at: 0, sideBeats: 0, lastSideEnd: -Infinity, squatStreak: 0 }];
  for (let at = 0; at < bars; at++) {
    const states = beam[at].sort((a, b) => a.cost - b.cost).slice(0, 8);
    for (const state of states)
      for (const edge of edges) {
        const end = at + edge.bars;
        if (end > bars) continue;
        if (!edge.pattern && (predicted[at].rest < 0.45 || (state.edge && !state.edge.closed)))
          continue;
        if (
          edge.side &&
          (at * 4 < 64 ||
            state.sideBeats + edge.bars * 4 > sideBudget ||
            at * 4 - state.lastSideEnd < 96)
        )
          continue;
        const squatStreak = edge.longSquat ? state.squatStreak + edge.longSquat : 0;
        // Maximum observed continued HOLD→SWAY phrase is approximately 64 beats;
        // this is an experimental corpus bound, not a universal exercise limit.
        if (squatStreak > 64.01) continue;
        const cost =
          state.cost +
          mismatch(at, edge) +
          (edge.pattern && state.edge?.pattern?.id === edge.pattern.id ? 0.1 : 0);
        const next: State = {
          cost,
          at: end,
          previous: state,
          edge,
          sideBeats: state.sideBeats + (edge.side ? edge.bars * 4 : 0),
          lastSideEnd: edge.side ? end * 4 : state.lastSideEnd,
          squatStreak: edge.closed ? 0 : squatStreak,
        };
        const dest = beam[end];
        dest.push(next);
        if (dest.length > 48) {
          dest.sort((a, b) => a.cost - b.cost);
          dest.length = 12;
        }
      }
  }
  let node = beam[bars].sort((a, b) => a.cost - b.cost)[0];
  if (!node) throw Error('音乐段落／休止／完整镜像组无法共同满足，未生成不完整谱面。');
  const cost = node.cost,
    path: State[] = [];
  while (node.previous) {
    path.unshift(node);
    node = node.previous;
  }
  const notes: Note[] = [],
    plan = [];
  for (const state of path) {
    const edge = state.edge!,
      startBar = state.previous!.at,
      startMs = origin + startBar * 4 * beatMs;
    if (edge.pattern)
      notes.push(
        ...stampPattern(edge.pattern, startMs + (base.videoOffsetMs ?? 0), beatMs, edge.repeats),
      );
    plan.push({
      startMs: Math.round(startMs),
      endMs: Math.round(origin + state.at * 4 * beatMs),
      brickId: edge.pattern?.id ?? 'REST',
      label: edge.pattern?.label ?? '蓄势／休止候选',
      repeats: edge.repeats,
      source: predicted[startBar].evidence,
      expectedRest: predicted.slice(startBar, state.at).map((p) => +p.rest.toFixed(3)),
    });
  }
  const chart = parseChart(sortChart({ ...tempo.chart, notes }));
  return {
    chart,
    report: {
      version: 3,
      bpm: tempo.report.bpm,
      anchorMs: tempo.report.anchorMs,
      audioStartMs: origin,
      endMs: tempo.report.endMs,
      structureSource: 'LinkSeg 7-class predictions',
      warehouseVersion: warehouse.version,
      referenceTitles: warehouse.references.map((r) => r.title),
      noteCount: notes.length,
      laneCounts: Object.fromEntries(
        ['squat', 'punch', 'calf_raise', 'side_crunch'].map((l) => [
          l,
          notes.filter((n) => n.lane === l).length,
        ]),
      ),
      planner: 'music-conditioned bar profiles + beam search; in-training reconstruction',
      cost,
      plan,
      sideCrunch: {
        usedBeats: path.filter((s) => s.edge?.side).reduce((sum, s) => sum + s.edge!.bars * 4, 0),
        budgetBeats: sideBudget,
        maxBoutBeats: 8,
        cooldownBeats: 96,
      },
      predicted: predicted.map((p, i) => ({ startMs: Math.round(origin + i * 4 * beatMs), ...p })),
      warnings: [
        '四首人工谱联合学习的待审实验，包含本曲人工参考，不代表跨曲泛化通过。',
        '曲式标签来自7类模型候选，Bメロ和人声入场仍未识别。',
        '休止包含先回位再蓄势的空拍，不是按低音符数把持续蹲姿标成休息。',
      ],
    },
  };
}
