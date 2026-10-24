import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { blankChart } from './model';
import {
  FitLogAccumulator,
  fitLogSummary,
  fitLogTime,
  fitLogWeek,
  localFitDate,
  mergeFitSession,
  parseFitSession,
} from './fit-log';
import { FitLogStore } from '../scripts/fit-log-store';

const chart = {
  ...blankChart('Fit Log test'),
  songId: '11111111-1111-4111-8111-111111111111',
  notes: [
    {
      id: 'one',
      lane: 'squat' as const,
      kind: 'tap' as const,
      direction: 'down' as const,
      timeMs: 1000,
    },
    {
      id: 'skip',
      lane: 'squat' as const,
      kind: 'tap' as const,
      direction: 'down' as const,
      timeMs: 5000,
    },
  ],
};
const id = '22222222-2222-4222-8222-222222222222';
const now = new Date(2026, 9, 25, 10).getTime();
const session = () => new FitLogAccumulator(chart, id, now);

describe('Fit Log participation', () => {
  it('groups the local Monday–Sunday week, sums sessions per date and excludes other weeks', () => {
    const a = session().snapshot();
    a.days = [
      { date: '2026-10-18', durationMs: 3600000, estimatedKcal: 1 },
      { date: '2026-10-19', durationMs: 60000, estimatedKcal: 1 },
      { date: '2026-10-25', durationMs: 120000, estimatedKcal: 1 },
    ];
    const b = {
      ...a,
      id: '33333333-3333-4333-8333-333333333333',
      days: [{ date: '2026-10-19', durationMs: 60000, estimatedKcal: 1 }],
    };
    const week = fitLogWeek([a, b], new Date(2026, 9, 25));
    expect(week.number).toBe(43);
    expect(week.days.map((day) => day.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(week.activeDays).toBe(2);
    expect(week.days[0].durationMs).toBe(120000);
    expect(fitLogWeek([], new Date(2026, 9, 26)).activeDays).toBe(0);
  });
  it('keeps ISO week/year correct around New Year while retaining local dates', () => {
    expect(fitLogWeek([], new Date(2021, 0, 1))).toMatchObject({ year: 2020, number: 53 });
    const next = fitLogWeek([], new Date(2021, 0, 4));
    expect(next).toMatchObject({ year: 2021, number: 1 });
    expect(next.days[0].date).toBe('2021-01-04');
    expect(next.days[6].date).toBe('2021-01-10');
  });
  it('counts a manual stamp without inventing exercise, and does not double count a played date', () => {
    const date = localFitDate(new Date(now));
    expect(fitLogWeek([], new Date(now), [date])).toMatchObject({ activeDays: 1 });
    expect(fitLogSummary([], new Date(now), [date])).toMatchObject({
      durationMs: 0,
      estimatedKcal: 0,
      streak: 1,
    });
    const a = session();
    a.append(0, 2000, now, now + 2000);
    expect(fitLogWeek([a.snapshot()], new Date(now), [date]).activeDays).toBe(1);
    expect(fitLogWeek([a.snapshot()], new Date(now), []).activeDays).toBe(1);
  });
  it('counts playback, rejects seek jumps and backwards movement, retains repeated effort', () => {
    const a = session();
    a.append(0, 2000, now, now + 2000);
    a.append(2000, 10000, now + 2000, now + 2100);
    a.append(10000, 0, now + 2100, now + 2200);
    a.append(0, 2000, now + 2200, now + 4200);
    const day = a.snapshot().days[0];
    expect(day.durationMs).toBe(4000);
    expect(day.estimatedKcal).toBeCloseTo(2 * 3.6 * 0.0414);
  });
  it('splits time and chart effort over local midnight', () => {
    const midnight = new Date(2026, 9, 26).getTime();
    const a = new FitLogAccumulator(chart, id, midnight - 1000);
    a.append(0, 2000, midnight - 1000, midnight + 1000);
    expect(a.snapshot().days.map((d) => [d.date, d.durationMs])).toEqual([
      ['2026-10-25', 1000],
      ['2026-10-26', 1000],
    ]);
    expect(a.snapshot().days.reduce((sum, d) => sum + d.estimatedKcal, 0)).toBeCloseTo(
      3.6 * 0.0414,
    );
  });
  it('does not double count old checkpoints or erase completed attempts', () => {
    const a = session();
    a.append(0, 1000, now, now + 1000);
    const early = a.snapshot();
    a.append(1000, 2000, now + 1000, now + 2000);
    a.session.completed = true;
    const merged = mergeFitSession(a.snapshot(), early);
    expect(merged.completed).toBe(true);
    expect(merged.days[0].durationMs).toBe(2000);
    expect(() => mergeFitSession(merged, { ...early, songId: 'another' })).toThrow();
  });
  it('keeps the streak through yesterday, never counts a missing day, supports hour formatting', () => {
    const a = session().snapshot();
    a.days = ['2026-10-22', '2026-10-23', '2026-10-24'].map((date) => ({
      date,
      durationMs: 3600000,
      estimatedKcal: 10,
    }));
    expect(fitLogSummary([a], new Date(now)).streak).toBe(3);
    expect(fitLogSummary([a], new Date(now)).durationMs).toBe(0);
    expect(fitLogSummary([a], new Date(2026, 9, 26, 12)).streak).toBe(0);
    expect(fitLogTime(80 * 60000)).toEqual({ hours: 1, minutes: 20, underMinute: false });
    expect(localFitDate(new Date(2026, 0, 2))).toBe('2026-01-02');
    expect(() =>
      parseFitSession({ ...a, days: [{ date: '2026-02-30', durationMs: 1, estimatedKcal: 0 }] }),
    ).toThrow();
  });
});

it('persists to disk, merges concurrent checkpoints, backs up and preserves corrupt originals', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'wfp-fit-log-'));
  try {
    const store = new FitLogStore(directory);
    expect((await store.read()).sessions).toEqual([]);
    const a = session();
    a.append(0, 1000, now, now + 1000);
    const early = a.snapshot();
    a.append(1000, 2000, now + 1000, now + 2000);
    await Promise.all([store.save(a.snapshot()), store.save(early)]);
    expect((await new FitLogStore(directory).read()).sessions[0].days[0].durationMs).toBe(2000);
    expect(
      JSON.parse(await readFile(path.join(directory, 'sessions.backup.json'), 'utf8')).version,
    ).toBe(1);
    const date = localFitDate(new Date(now));
    await store.checkIn(date, true, new Date(now));
    expect((await new FitLogStore(directory).read()).checkIns).toEqual([date]);
    await store.save(early);
    expect((await store.read()).checkIns).toEqual([date]);
    await store.checkIn(date, false, new Date(now));
    expect((await store.read()).checkIns).toEqual([]);
    expect((await store.read()).sessions[0].days[0].durationMs).toBe(2000);
    await expect(store.checkIn('2026-10-24', true, new Date(now))).rejects.toThrow('今天');
    await writeFile(path.join(directory, 'sessions.json'), 'damaged');
    await expect(store.save(early)).rejects.toThrow('原文件已保留');
    await expect(store.checkIn(date, true, new Date(now))).rejects.toThrow('原文件已保留');
    expect(await readFile(path.join(directory, 'sessions.json'), 'utf8')).toBe('damaged');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
