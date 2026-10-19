export type ChartType = 'fitness' | 'dance';
export const CHART_TYPES: ChartType[] = ['fitness', 'dance'];
export type ExerciseIntensity = 'low' | 'medium' | 'high';
export const EXERCISE_INTENSITIES: ExerciseIntensity[] = ['low', 'medium', 'high'];
export const INTENSITY_LABELS = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' } as const;

type RatedChart = {
  chartType?: ChartType;
  intensity?: ExerciseIntensity;
  danceDifficulty?: number;
};
export const ratingValue = (chart: RatedChart) =>
  chart.chartType === 'fitness'
    ? chart.intensity
      ? INTENSITY_LABELS[chart.intensity]
      : '—'
    : String(chart.danceDifficulty ?? '—');
export const ratingSummary = (chart: RatedChart) =>
  `${chart.chartType === 'fitness' ? '强度' : '难度'} ${ratingValue(chart)}`;

/** The old two slots become two chart types; an absent old type was Hard. */
export function chartTypeFrom(value: unknown): ChartType {
  return value === 'normal' || value === 'fitness' ? 'fitness' : 'dance';
}

/** Metadata-only migration: never validate/rewrite notes or infer exercise intensity. */
export function migrateChartMetadata(source: Record<string, unknown>, slot?: ChartType) {
  const next: Record<string, unknown> = {
    ...source,
    chartType:
      slot ??
      (source.chartType !== undefined ? source.chartType : chartTypeFrom(source.difficulty)),
  };
  if (next.danceDifficulty === undefined && source.difficultyRating !== undefined)
    next.danceDifficulty = source.difficultyRating;
  delete next.difficulty;
  delete next.difficultyRating;
  return next;
}
