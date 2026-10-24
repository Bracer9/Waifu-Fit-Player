import { caloriesAt, createCalorieIndex } from './calories';
import type { Chart } from './model';
import { chartTimeAt } from './timing';

export type FitLogDay = { date: string; durationMs: number; estimatedKcal: number };
export type FitLogSession = {
  id: string;
  songId: string;
  title: string;
  chartType: 'fitness' | 'dance';
  startedAt: number;
  updatedAt: number;
  completed: boolean;
  days: FitLogDay[];
};
export type FitLogData = { version: 1; sessions: FitLogSession[]; checkIns?: string[] };
export const emptyFitLog = (): FitLogData => ({ version: 1, sessions: [], checkIns: [] });
export const localFitDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function parseFitCheckIns(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (date) =>
        typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        localFitDate(new Date(`${date}T12:00:00`)) !== date,
    )
  )
    throw new Error('打卡日期格式无效。');
  return [...new Set(value)].sort();
}

export function parseFitSession(value: unknown): FitLogSession {
  const s = value as FitLogSession;
  const validDate = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) && localFitDate(new Date(`${date}T12:00:00`)) === date;
  if (
    !s ||
    !/^[a-f0-9-]{36}$/.test(s.id) ||
    typeof s.songId !== 'string' ||
    s.songId.length > 100 ||
    typeof s.title !== 'string' ||
    s.title.length > 300 ||
    !['fitness', 'dance'].includes(s.chartType) ||
    !Number.isSafeInteger(s.startedAt) ||
    s.startedAt < 0 ||
    !Number.isSafeInteger(s.updatedAt) ||
    s.updatedAt < s.startedAt ||
    typeof s.completed !== 'boolean' ||
    !Array.isArray(s.days) ||
    s.days.length > 32 ||
    new Set(s.days.map((d) => d?.date)).size !== s.days.length ||
    s.days.some(
      (d) =>
        !d ||
        typeof d.date !== 'string' ||
        !validDate(d.date) ||
        !Number.isFinite(d.durationMs) ||
        d.durationMs < 0 ||
        d.durationMs > 86400000 ||
        !Number.isFinite(d.estimatedKcal) ||
        d.estimatedKcal < 0 ||
        d.estimatedKcal > 100000,
    )
  )
    throw new Error('运动记录格式无效。');
  return {
    id: s.id,
    songId: s.songId,
    title: s.title,
    chartType: s.chartType,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
    completed: s.completed,
    days: s.days.map((d) => ({
      date: d.date,
      durationMs: d.durationMs,
      estimatedKcal: d.estimatedKcal,
    })),
  };
}

/** Checkpoint retries and late requests can never erase already recorded participation. */
export function mergeFitSession(
  previous: FitLogSession | undefined,
  next: FitLogSession,
): FitLogSession {
  if (!previous) return structuredClone(next);
  if (
    previous.songId !== next.songId ||
    previous.startedAt !== next.startedAt ||
    previous.chartType !== next.chartType
  )
    throw new Error('运动记录 ID 冲突。');
  const days = new Map(previous.days.map((d) => [d.date, d]));
  for (const d of next.days) {
    const old = days.get(d.date);
    days.set(d.date, {
      date: d.date,
      durationMs: Math.max(old?.durationMs ?? 0, d.durationMs),
      estimatedKcal: Math.max(old?.estimatedKcal ?? 0, d.estimatedKcal),
    });
  }
  return {
    ...(next.updatedAt >= previous.updatedAt ? next : previous),
    completed: previous.completed || next.completed,
    updatedAt: Math.max(previous.updatedAt, next.updatedAt),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function fitLogSummary(
  sessions: readonly FitLogSession[],
  now = new Date(),
  checkIns: readonly string[] = [],
) {
  const days = new Map<string, FitLogDay>();
  for (const session of sessions)
    for (const day of session.days) {
      const previous = days.get(day.date);
      days.set(day.date, {
        date: day.date,
        durationMs: (previous?.durationMs ?? 0) + day.durationMs,
        estimatedKcal: (previous?.estimatedKcal ?? 0) + day.estimatedKcal,
      });
    }
  const today = days.get(localFitDate(now)) ?? {
    date: localFitDate(now),
    durationMs: 0,
    estimatedKcal: 0,
  };
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const active = new Set([
    ...checkIns,
    ...[...days.values()].filter((day) => day.durationMs > 0).map((day) => day.date),
  ]);
  if (!active.has(localFitDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active.has(localFitDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { ...today, streak };
}

export function fitLogTime(durationMs: number) {
  const minutes = Math.floor(durationMs / 60000);
  return {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
    underMinute: durationMs > 0 && minutes === 0,
  };
}

/** Monday–Sunday in the user's local calendar; ISO week numbers across year boundaries. */
export function fitLogWeek(
  sessions: readonly FitLogSession[],
  now = new Date(),
  checkIns: readonly string[] = [],
) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const totals = new Map<string, number>();
  for (const session of sessions)
    for (const day of session.days)
      totals.set(day.date, (totals.get(day.date) ?? 0) + day.durationMs);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    return {
      date: localFitDate(date),
      durationMs: totals.get(localFitDate(date)) ?? 0,
      checked: checkIns.includes(localFitDate(date)),
    };
  });
  const thursday = new Date(
    Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3),
  );
  const year = thursday.getUTCFullYear();
  const number = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return {
    year,
    number,
    days,
    activeDays: days.filter((day) => day.durationMs > 0 || day.checked).length,
  };
}

/** Integrate watched chart intervals, splitting at real local midnights (including DST). */
export class FitLogAccumulator {
  private index;
  readonly session: FitLogSession;
  private first = true;
  constructor(
    private chart: Chart,
    id: string,
    startedAt: number,
  ) {
    this.index = createCalorieIndex(chart.notes);
    this.session = {
      id,
      songId: chart.songId ?? '',
      title: chart.title,
      chartType: chart.chartType ?? 'dance',
      startedAt,
      updatedAt: startedAt,
      completed: false,
      days: [],
    };
  }
  append(fromMs: number, toMs: number, wallStart: number, wallEnd: number, rate = 1) {
    const delta = toMs - fromMs,
      elapsed = wallEnd - wallStart;
    if (delta <= 0 || elapsed <= 0 || rate <= 0 || delta > elapsed * rate + 250) return;
    const duration = Math.min(elapsed, delta / rate);
    const start = wallEnd - duration;
    let cursor = start;
    while (cursor < wallEnd) {
      const date = new Date(cursor);
      const end = Math.min(
        wallEnd,
        new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime(),
      );
      const a = fromMs + delta * ((cursor - start) / duration);
      const b = fromMs + delta * ((end - start) / duration);
      const dayKey = localFitDate(date);
      let day = this.session.days.find((d) => d.date === dayKey);
      if (!day) this.session.days.push((day = { date: dayKey, durationMs: 0, estimatedKcal: 0 }));
      day.durationMs += end - cursor;
      day.estimatedKcal += Math.max(
        0,
        caloriesAt(this.index, chartTimeAt(this.chart, b)) -
          caloriesAt(this.index, chartTimeAt(this.chart, a) - (this.first ? 0.001 : 0)),
      );
      this.first = false;
      cursor = end;
    }
    this.session.updatedAt = Math.round(wallEnd);
  }
  snapshot() {
    return structuredClone(this.session);
  }
}
