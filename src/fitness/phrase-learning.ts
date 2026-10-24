/** Research-only, audio-conditioned movement planning. Labels include actual
 * notation gaps; a quiet onset track or a sustained squat is not a rest label. */
import type { Note } from '../model';
import { armHand } from '../model';
import { musicContext } from './context';
import type { MusicSpectrumData } from './spectrum';
import type { AnalyzedMusicSection } from './retraining';
import { fitContext, type ContextExample } from './learning';

export const PLAN_MODES = [
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
] as const;
export type MovementCell = {
  presence: number[];
  tapDensity: number;
  held: number[];
  rest: number;
  left: number;
  right: number;
};
export type PhraseExample = ContextExample & { target: MovementCell };
export type PhraseModel = {
  version: 1;
  means: number[];
  scales: number[];
  examples: PhraseExample[];
};
const labels = ['intro', 'verse', 'chorus', 'inst', 'bridge', 'outro', 'silence'];
function mode(n: Note) {
  return `${n.lane}:${n.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'hold') : 'tap'}`;
}
function returning(n: Note, notes: readonly Note[]) {
  return (
    n.kind === 'tap' &&
    ['squat', 'calf_raise'].includes(n.lane) &&
    notes.some(
      (h) =>
        h.kind === 'hold' &&
        h.lane === n.lane &&
        h.direction !== n.direction &&
        Math.abs(h.endTimeMs - n.timeMs) <= 3,
    )
  );
}
export function movementCell(
  notes: readonly Note[],
  startMs: number,
  endMs: number,
  beatMs: number,
): MovementCell {
  const selected = notes.filter(
    (n) =>
      n.timeMs < endMs - 1 &&
      (n.kind === 'hold' ? n.endTimeMs > startMs + 1 : n.timeMs >= startMs - 1),
  );
  const held = PLAN_MODES.map(
    (m) =>
      selected
        .filter((n) => n.kind === 'hold' && mode(n) === m)
        .reduce(
          (sum, n) =>
            sum +
            (n.kind === 'hold'
              ? Math.max(0, Math.min(endMs, n.endTimeMs) - Math.max(startMs, n.timeMs))
              : 0),
          0,
        ) /
      (endMs - startMs),
  );
  const arrivals = selected.filter((n) => n.timeMs >= startMs - 1 && !returning(n, notes));
  const presence = PLAN_MODES.map((m, i) =>
    held[i] > 0 ? Math.min(1, held[i] * 2) : arrivals.some((n) => mode(n) === m) ? 1 : 0,
  );
  const tapDensity = arrivals.filter((n) => n.kind === 'tap').length / ((endMs - startMs) / beatMs);
  let poseLoaded = false;
  for (const [lane, enter] of [
    ['squat', 'down'],
    ['calf_raise', 'up'],
  ]) {
    const previous = notes.filter((n) => n.lane === lane && n.timeMs <= startMs + 1).at(-1);
    if (previous?.kind === 'tap' && previous.direction === enter) poseLoaded = true;
    // An unannotated release after a hold is ambiguous; don't call it rest.
    if (previous?.kind === 'hold' && previous.endTimeMs <= startMs && previous.direction === enter)
      poseLoaded = true;
  }
  let left = 0,
    right = 0;
  for (const n of arrivals) {
    const side = n.lane === 'punch' ? armHand(n) : n.lane === 'side_crunch' ? n.direction : null;
    if (side === 'left' || side === 'both') left++;
    if (side === 'right' || side === 'both') right++;
  }
  return {
    presence,
    tapDensity,
    held,
    rest: selected.filter((n) => !returning(n, notes)).length === 0 && !poseLoaded ? 1 : 0,
    left,
    right,
  };
}
export function phraseFeatures(
  onsets: Float32Array,
  levels: Float32Array,
  spectrum: MusicSpectrumData,
  sections: AnalyzedMusicSection[],
  startMs: number,
  beatMs: number,
  rate = 200,
) {
  const endMs = startMs + 4 * beatMs;
  // Eight-bar musical context preserves approach/release around a short rest.
  const c = musicContext(
    onsets,
    levels,
    spectrum,
    startMs - 8 * beatMs,
    startMs + 24 * beatMs,
    beatMs,
    rate,
  );
  const section = sections.find(
    (s) => s.startMs <= startMs + 2 * beatMs && s.endMs > startMs + 2 * beatMs,
  );
  const functional = labels.map((l) => (section?.label === l ? 2 : 0));
  const previous = sections.filter((s) => s.startMs < startMs).at(-1);
  const next = sections.find((s) => s.startMs > endMs - 1);
  return [
    ...c.values,
    ...functional,
    Math.min(16, Math.max(0, (startMs - (previous?.startMs ?? 0)) / beatMs)) / 8,
    Math.min(16, Math.max(0, ((next?.startMs ?? endMs + 16 * beatMs) - endMs) / beatMs)) / 8,
    section
      ? Math.max(0, Math.min(1, (startMs - section.startMs) / (section.endMs - section.startMs)))
      : 0,
  ];
}
export function fitPhraseModel(examples: PhraseExample[]): PhraseModel {
  const stats = fitContext(examples);
  return { version: 1, means: stats.means, scales: stats.scales, examples };
}
export function predictMovementCell(values: number[], model: PhraseModel) {
  const ranked = model.examples
    .map((e) => ({
      example: e,
      distance: Math.sqrt(
        values.reduce((sum, v, i) => sum + ((v - e.values[i]) / (model.scales[i] || 1)) ** 2, 0) /
          values.length,
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  const selected: typeof ranked = [];
  for (const n of ranked) {
    if (selected.filter((s) => s.example.song === n.example.song).length >= 2) continue;
    selected.push(n);
    if (selected.length === 6) break;
  }
  let total = 0;
  const result: MovementCell = {
    presence: PLAN_MODES.map(() => 0),
    held: PLAN_MODES.map(() => 0),
    tapDensity: 0,
    rest: 0,
    left: 0,
    right: 0,
  };
  for (const n of selected) {
    const weight = Math.exp(-n.distance * 2) / (n.distance + 0.03) ** 3;
    total += weight;
    for (const key of ['tapDensity', 'rest', 'left', 'right'] as const)
      result[key] += n.example.target[key] * weight;
    for (let i = 0; i < PLAN_MODES.length; i++) {
      result.presence[i] += n.example.target.presence[i] * weight;
      result.held[i] += n.example.target.held[i] * weight;
    }
  }
  for (const key of ['tapDensity', 'rest', 'left', 'right'] as const) result[key] /= total || 1;
  for (let i = 0; i < PLAN_MODES.length; i++) {
    result.presence[i] /= total || 1;
    result.held[i] /= total || 1;
  }
  return {
    ...result,
    evidence: selected.slice(0, 2).map((n) => ({
      song: n.example.song,
      startMs: n.example.startMs,
      distance: +n.distance.toFixed(3),
    })),
  };
}
