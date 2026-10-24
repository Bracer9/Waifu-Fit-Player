/** Offline v4 study. This module is not imported by the game/worker.
 * Learn relative musical phase -> movement tasks, then arrange complete groups.
 * Neither timbre/key nor an unseen song's chart answers choose its exercises.
 */
import warehouse from './bricks-study.json';
import { normalizeFitnessPattern, stampPattern, type FitnessPattern } from './patterns';
import {
  movementCell,
  fitPhraseModel,
  predictMovementCell,
  PLAN_MODES,
  type MovementCell,
  type PhraseModel,
} from './phrase-learning';
import { meanLevel, musicSimilarity } from './music';
import type { MusicSpectrumData } from './spectrum';
import { parseChart, sortChart, type Chart, type Note } from '../model';

export const FUNCTIONS = [
  'silence',
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'post-chorus',
  'inst',
  'bridge',
  'outro',
];
export type StructureStudy = {
  sections: { startMs: number; endMs: number; label: string }[];
  beatTimes: number[];
  embedding: number[];
};
export type StudyTrack = {
  title: string;
  base: Chart;
  onsets: number[];
  levels: number[];
  spectrum: MusicSpectrumData;
};
export type Grid = { bpm: number; anchorMs: number; audioStartMs: number; endMs: number };
const average = (v: number[]) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** LinkSeg predicts boundaries between adjacent beat windows. Attach a split
 * to the following beat, rather than treating that half-beat timestamp as onset.
 * Preserve the raw prediction in the report; this is not human structure truth.
 */
export function alignStructure(raw: StructureStudy, grid: Grid) {
  const beatMs = 60000 / grid.bpm;
  return raw.sections
    .map((s) => ({
      ...s,
      rawStartMs: s.startMs,
      startMs:
        s.startMs === 0
          ? 0
          : Math.round(
              grid.audioStartMs +
                Math.ceil((s.startMs - grid.audioStartMs) / beatMs - 0.05) * beatMs,
            ),
      endMs: Math.round(
        grid.audioStartMs + Math.ceil((s.endMs - grid.audioStartMs) / beatMs - 0.05) * beatMs,
      ),
    }))
    .filter((s) => s.startMs < grid.endMs && s.endMs > grid.audioStartMs);
}

export function musicalBars(a: StudyTrack, raw: StructureStudy, grid: Grid) {
  const beatMs = 60000 / grid.bpm,
    barMs = 4 * beatMs;
  const sections = alignStructure(raw, grid).filter(
    (s) => s.endMs > grid.audioStartMs + 2 * beatMs,
  );
  const intervals: { startMs: number; endMs: number }[] = [];
  // Re-anchor each predicted section, preserving occasional two-beat pickups.
  // A remainder is a neutral transition, never a shortened exercise template.
  for (const [index, s] of sections.entries()) {
    const start = index === 0 ? grid.audioStartMs : Math.max(grid.audioStartMs, s.startMs);
    const end = Math.min(s.endMs, grid.endMs);
    for (let t = start; t < end - 1; t += barMs)
      intervals.push({ startMs: t, endMs: Math.min(end, t + barMs) });
  }
  const levels = Float32Array.from(a.levels),
    onsets = Float32Array.from(a.onsets);
  const energy = intervals.map((b) => meanLevel(levels, b.startMs, b.endMs, 200));
  const attack = intervals.map((b) => meanLevel(onsets, b.startMs, b.endMs, 200));
  const rank = (v: number[], x: number) => v.filter((y) => y < x).length / (v.length || 1);
  return energy.map((e, i) => {
    const { startMs, endMs } = intervals[i];
    const section =
      sections.find((s) => s.startMs < endMs && s.endMs > startMs) ?? sections.at(-1)!;
    const before = average(energy.slice(Math.max(0, i - 4), i)),
      after = average(energy.slice(i + 1, i + 5));
    const previousSection = sections.filter((s) => s.startMs < startMs + 1).at(-1);
    const next = sections.find((s) => s.startMs >= endMs - 1 && s.label !== section.label);
    const toNext = next ? (next.startMs - endMs) / barMs : 32;
    const dip = e / (Math.max(before, after) || 1e-6);
    const tame =
      toNext < 0.1 &&
      next?.label === 'chorus' &&
      dip < 0.8 &&
      attack[i] < average(attack.slice(Math.max(0, i - 4), i)) * 0.85;
    const values = [
      rank(energy, e),
      rank(attack, attack[i]),
      clamp(Math.log((e + 1e-6) / (before + 1e-6)), -2, 2),
      clamp(Math.log((after + 1e-6) / (e + 1e-6)), -2, 2),
      clamp(dip, 0, 2),
      ...FUNCTIONS.map((l) => (section.label === l ? 2 : 0)),
      clamp((startMs - section.startMs) / (section.endMs - section.startMs)),
      clamp((startMs - (previousSection?.startMs ?? startMs)) / barMs / 8),
      clamp(toNext / 8),
      next?.label === 'chorus' ? 1 : 0,
      tame ? 1 : 0,
    ];
    return {
      startMs,
      endMs,
      partial: endMs - startMs < barMs - 1,
      energy: e,
      energyRank: rank(energy, e),
      attack: attack[i],
      function: section.label,
      sectionStart: section.startMs,
      sectionEnd: section.endMs,
      tame,
      values,
    };
  });
}

export function learnArrangement(tracks: { audio: StudyTrack; structure: StructureStudy }[]) {
  const examples = [];
  for (const { audio, structure } of tracks) {
    const t = audio.base.tempoSegments[0],
      offset = audio.base.videoOffsetMs ?? 0;
    const grid = {
      bpm: t.bpm,
      anchorMs: t.anchorMs,
      audioStartMs: t.anchorMs - offset,
      endMs: audio.base.playRange?.endMs ?? audio.base.videoHint.durationMs,
    };
    const notes = audio.base.notes.map((n) => ({
      ...n,
      timeMs: n.timeMs - offset,
      ...(n.kind === 'hold' ? { endTimeMs: n.endTimeMs - offset } : {}),
    }));
    for (const b of musicalBars(audio, structure, grid))
      examples.push({
        song: audio.title,
        brickId: 'musical-task',
        family: b.function,
        beats: 4,
        startMs: Math.round(b.startMs),
        endMs: Math.round(b.endMs),
        values: b.values,
        target: movementCell(notes, b.startMs, b.endMs, 60000 / t.bpm),
      });
  }
  return fitPhraseModel(examples);
}

type Edge = {
  pattern: FitnessPattern | null;
  repeats: number;
  bars: number;
  cells: MovementCell[];
  squat: number;
  calf: number;
  side: boolean;
  closed: boolean;
};
type State = {
  at: number;
  cost: number;
  edge?: Edge;
  previous?: State;
  sideBeats: number;
  lastSide: number;
  squatRun: number;
  calfRun: number;
  calfHeld: number;
  squatHeld: number;
  lowRun: number;
};
function embeddingBars(raw: StructureStudy, bars: ReturnType<typeof musicalBars>) {
  const rows = raw.beatTimes.map((_, i) => raw.embedding.slice(i * 32, i * 32 + 32));
  const mean = Array.from({ length: 32 }, (_, i) => average(rows.map((r) => r[i])));
  return bars.map((b) =>
    Array.from(
      { length: 32 },
      (_, d) =>
        average(
          rows
            .filter(
              (_, i) => raw.beatTimes[i] * 1000 >= b.startMs && raw.beatTimes[i] * 1000 < b.endMs,
            )
            .map((r) => r[d]),
        ) - mean[d],
    ),
  );
}
export function arrangeFitness(a: StudyTrack, raw: StructureStudy, grid: Grid, model: PhraseModel) {
  const beatMs = 60000 / grid.bpm,
    bars = musicalBars(a, raw, grid),
    count = bars.length;
  const predicted = bars.map((b) => predictMovementCell(b.values, model));
  const embeddings = embeddingBars(raw, bars);
  const repeats = new Map<number, { previous: number; similarity: number; bars: number }>();
  // Within-song relation only. Centered learned embeddings must agree with
  // pitch/timbre evolution; constant loudness alone cannot imply repetition.
  for (let i = 4; i + 4 <= count; i++) {
    let best = { previous: -1, similarity: 0, bars: 4 };
    for (let j = 0; j + 4 <= i; j++) {
      if (
        bars[i].function !== bars[j].function ||
        Math.abs(
          bars[i].startMs - bars[i].sectionStart - (bars[j].startMs - bars[j].sectionStart),
        ) > beatMs
      )
        continue;
      const em = musicSimilarity(
        embeddings.slice(i, i + 4).flat(),
        embeddings.slice(j, j + 4).flat(),
      );
      const spectral = (at: number) =>
        Array.from({ length: 16 }, (_, k) => {
          const time = bars[at].startMs + (k + 0.5) * beatMs;
          return (
            a.spectrum.frames[Math.floor((time / 1000) * a.spectrum.rate)] ?? Array(24).fill(0)
          );
        }).flat();
      const sp = musicSimilarity(spectral(i), spectral(j));
      const similarity = 0.6 * em + 0.4 * sp;
      if (em > 0.8 && sp > 0.85 && similarity > best.similarity)
        best = { previous: j, similarity, bars: 4 };
    }
    if (best.previous >= 0 && best.similarity > 0.87) repeats.set(i, best);
  }
  const edges: Edge[] = [];
  for (const source of warehouse.bricks) {
    // Retain authored relative timing/settle space. Do not move a whole source
    // window's leading empty bar onto its tail during musical-phase learning.
    const p = (
      Math.min(...source.notes.map((n) => n.at)) === 0
        ? normalizeFitnessPattern(source)
        : { ...source, sourceBeats: source.beats, leadingBeatsRemoved: 0 }
    ) as FitnessPattern;
    if (
      p.notes.some(
        (n) => n.at >= p.beats || (n.kind === 'hold' && (n.duration ?? 0) * beatMs > 15000),
      )
    )
      continue;
    for (const n of p.mirrorRequired ? [2, 4] : [1, 2, 4, 8]) {
      const length = p.beats * n;
      if (length < 4 || length > 32) continue;
      if (p.lanes.includes('side_crunch') && length > 8) continue;
      const notes = stampPattern(p, 0, beatMs, n);
      const cells = Array.from({ length: length / 4 }, (_, i) =>
        movementCell(notes, i * 4 * beatMs, (i + 1) * 4 * beatMs, beatMs),
      );
      const poseClosed = (lane: string, release: string) => {
        const last = notes.filter((n) => n.lane === lane).at(-1);
        return !last || last.direction === release;
      };
      edges.push({
        pattern: p,
        repeats: n,
        bars: length / 4,
        cells,
        squat: cells.filter((c) => c.presence.slice(0, 3).some((v) => v > 0.1)).length * 4,
        calf: cells.filter((c) => c.presence.slice(6, 9).some((v) => v > 0.1)).length * 4,
        side: p.lanes.includes('side_crunch'),
        closed: poseClosed('squat', 'up') && poseClosed('calf_raise', 'down'),
      });
    }
  }
  const rest: MovementCell = {
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
    cells: [rest],
    squat: 0,
    calf: 0,
    side: false,
    closed: true,
  });
  const boundaries = new Set(
    bars
      .map((b, i) => (i && b.sectionStart !== bars[i - 1].sectionStart ? i : -1))
      .filter((i) => i >= 0),
  );
  // A musical dip before chorus is an optional one-bar release task, not a
  // mandatory pause before every chorus. Completing a hold can provide it too.
  for (let i = 0; i < count; i++) if (bars[i].tame) boundaries.add(i);
  const sideBudget = Math.floor((count * 4 * 0.08) / 4) * 4;
  const beam: State[][] = Array.from({ length: count + 1 }, () => []);
  beam[0] = [
    {
      at: 0,
      cost: 0,
      sideBeats: 0,
      lastSide: -1000,
      squatRun: 0,
      calfRun: 0,
      calfHeld: 0,
      squatHeld: 0,
      lowRun: 0,
    },
  ];
  const costs = new Map<string, number>();
  function prune(states: State[], limit: number) {
    const keys = new Map<string, number>();
    return states
      .sort((a, b) => a.cost - b.cost)
      .filter((s) => {
        // Several repeat decompositions can describe the same physical state.
        // Keep room for lower-load paths instead of filling the beam with these
        // equivalent histories and only discovering an impossible streak later.
        const key = [
          s.edge?.pattern?.lanes.join(','),
          s.edge?.closed,
          Math.floor(s.squatRun / 16),
          Math.floor(s.calfRun / 16),
          Math.floor(s.calfHeld / 8),
          Math.floor(s.squatHeld / 16),
          s.sideBeats,
          Math.floor((s.at * 4 - s.lastSide) / 32),
        ].join(':');
        const seen = keys.get(key) ?? 0;
        keys.set(key, seen + 1);
        return seen < 2;
      })
      .slice(0, limit);
  }
  function localCost(at: number, e: Edge) {
    const key = `${at}:${e.pattern?.id ?? 'REST'}:${e.repeats}`;
    if (costs.has(key)) return costs.get(key)!;
    let cost = 1.35;
    for (let j = 0; j < e.bars; j++) {
      const x = e.cells[j],
        y = predicted[at + j],
        b = bars[at + j];
      cost +=
        2 * x.presence.reduce((s, v, i) => s + (v - y.presence[i]) ** 2, 0) +
        3 * x.held.reduce((s, v, i) => s + (v - y.held[i]) ** 2, 0) +
        0.6 * (x.tapDensity - y.tapDensity) ** 2;
      cost += b.tame ? 5 * (1 - x.rest) : 1.2 * (x.rest - y.rest) ** 2;
      if (b.function === 'silence') cost += 8 * (1 - x.rest);
      // Prevent a low-density isometric hold being scored as low body burden.
      const squat = x.presence.slice(0, 3).some((v) => v > 0.1);
      if (b.energyRank < 0.2 && squat) cost += 0.15;
      if (j && boundaries.has(at + j)) cost += 6;
    }
    if (e.pattern && Math.min(...e.pattern.notes.map((n) => n.at)) > 0) cost += 0.7;
    if (e.bars < 4) cost += 0.2;
    costs.set(key, cost);
    return cost;
  }
  for (let at = 0; at < count; at++)
    for (const state of prune(beam[at], 24))
      for (const edge of edges) {
        const end = at + edge.bars;
        if (end > count) continue;
        // Complete groups stop at structural/task changes. Rare 1-bar tails may
        // use rest only after an explicit return, never while a squat is loaded.
        if (Array.from(boundaries).some((b) => b > at && b < end)) continue;
        if (edge.pattern && bars.slice(at, end).some((b) => b.partial)) continue;
        const restAllowed =
          bars[at].partial ||
          bars[at].tame ||
          bars[at].function === 'silence' ||
          (predicted[at].rest > 0.65 && bars[at].energyRank < 0.2);
        if (!edge.pattern && (!restAllowed || (state.edge && !state.edge.closed))) continue;
        if (
          edge.side &&
          (at * 4 < 64 ||
            state.sideBeats + edge.bars * 4 > sideBudget ||
            at * 4 - state.lastSide < 96)
        )
          continue;
        const squatRun = edge.squat ? state.squatRun + edge.squat : 0,
          calfRun = edge.calf ? state.calfRun + edge.calf : 0;
        if (squatRun > 64 || calfRun > 96) continue;
        const calfHeld = edge.calf
          ? state.calfHeld + edge.cells.reduce((sum, c) => sum + (c.held[7] + c.held[8]) * 4, 0)
          : 0;
        const squatHeld = edge.squat
          ? state.squatHeld + edge.cells.reduce((sum, c) => sum + (c.held[1] + c.held[2]) * 4, 0)
          : 0;
        // Releasing for one beat does not erase accumulated sustained work. These
        // observed-reference bounds are distinct from the total-movement streak.
        if (calfHeld > 32.01 || squatHeld > 64.01) continue;
        const low = edge.cells.every(
          (c) =>
            c.tapDensity < 0.2 &&
            !c.presence.some((v, i) => v > 0.1 && [0, 1, 2, 6, 7, 8, 9].includes(i)),
        );
        const lowRun = low ? state.lowRun + edge.bars : 0;
        let cost =
          state.cost +
          localCost(at, edge) +
          Math.max(0, squatRun - 32) * 0.02 +
          Math.max(0, calfRun - 48) * 0.01 +
          Math.max(0, lowRun - 8) * 0.12;
        const relation = repeats.get(at);
        if (relation && edge.bars === relation.bars) {
          let past: State | undefined = state;
          while (past?.previous && past.previous.at > relation.previous) past = past.previous;
          if (
            past?.previous?.at === relation.previous &&
            past.edge?.pattern?.id === edge.pattern?.id &&
            past.edge?.repeats === edge.repeats
          )
            cost -= 0.7 * edge.bars * relation.similarity;
        }
        const next: State = {
          at: end,
          cost,
          edge,
          previous: state,
          sideBeats: state.sideBeats + (edge.side ? edge.bars * 4 : 0),
          lastSide: edge.side ? end * 4 : state.lastSide,
          squatRun,
          calfRun,
          calfHeld,
          squatHeld,
          lowRun,
        };
        const dest = beam[end];
        dest.push(next);
        if (dest.length > 100) {
          beam[end] = prune(dest, 48);
        }
      }
  // Some model boundaries fall an odd bar apart. Do not silently shift them
  // or chop a movement to make a path: report the unresolved segment.
  let node = beam[count].sort((x, y) => x.cost - y.cost)[0];
  if (!node) {
    const frontier =
      beam
        .map((states, i) => (states.length ? i : -1))
        .filter((i) => i >= 0)
        .at(-1) ?? 0;
    throw Error(
      `完整动作组与候选段落边界无可行编排（${Math.round(bars[frontier]?.startMs ?? grid.endMs)}ms）；没有写入maps。`,
    );
  }
  const path: State[] = [];
  while (node.previous) {
    path.unshift(node);
    node = node.previous;
  }
  const notes: Note[] = [],
    plan = [];
  for (const s of path) {
    const e = s.edge!,
      at = s.previous!.at,
      start = bars[at].startMs;
    if (e.pattern)
      notes.push(
        ...stampPattern(e.pattern, start + (a.base.videoOffsetMs ?? 0), beatMs, e.repeats),
      );
    plan.push({
      startMs: Math.round(start),
      endMs: Math.round(bars[s.at - 1].endMs),
      brickId: e.pattern?.id ?? 'REST',
      label: e.pattern?.label ?? '回位后的蓄势／休止',
      repeats: e.repeats,
      function: bars[at].function,
      squatRun: s.squatRun,
      calfRun: s.calfRun,
      musicRepeat: repeats.get(at),
      sources: e.pattern
        ? (warehouse.bricks.find((p) => p.id === e.pattern!.id)?.sources ?? [])
        : [],
      evidence: predicted[at].evidence,
    });
  }
  const chart = parseChart(
    sortChart({
      ...a.base,
      notes,
      tempoSegments: [{ ...a.base.tempoSegments[0], bpm: grid.bpm, anchorMs: grid.anchorMs }],
    }),
  );
  return {
    chart,
    report: {
      version: 4,
      grid,
      model: 'relative dynamics + nine-class functional phase; complete-group beam arrangement',
      trainingSongs: [...new Set(model.examples.map((e) => e.song))],
      targetInTraining: model.examples.some((e) => e.song === a.title),
      sections: alignStructure(raw, grid),
      plan,
      noteCount: notes.length,
      sideBudgetBeats: sideBudget,
      musicRepeats: [...repeats].map(([bar, r]) => ({ bar, ...r })),
      bars: bars.map((b, i) => ({ ...b, values: undefined, predicted: predicted[i] })),
      limitations: [
        '曲式标签尚未经人工确认；没有独立人声入场检测。',
        '动作选择为四首参考的统计编排实验，不是已验证的教练模型。',
        '连续负荷阈值是语料启发规则，不是运动处方。',
      ],
    },
  };
}
