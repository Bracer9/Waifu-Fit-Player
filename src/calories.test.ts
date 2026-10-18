import { describe, expect, it } from 'vitest';
import { caloriesAt, createCalorieIndex } from './calories';
import { blankChart, type Note } from './model';
import { chartTimeAt } from './timing';

const squat: Note = { id: 'squat', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 };
const squatHold: Note = { ...squat, kind: 'hold', modifier: 'none', endTimeMs: 5000 };
const total = (notes: Note[]) => caloriesAt(createCalorieIndex(notes), 60000);

describe('chart calorie estimate', () => {
  it('counts a weighted action at arrival, with no credit for future notes or empty time', () => {
    expect(total([])).toBe(0);
    const index = createCalorieIndex([squat]);
    expect(caloriesAt(index, 999)).toBe(0);
    expect(caloriesAt(index, 1000)).toBeCloseTo(0.1242);
    expect(caloriesAt(index, 60000)).toBe(caloriesAt(index, 1000));
    expect(total([squat])).toBeGreaterThan(total([{ ...squat, lane: 'step', direction: 'left' }]));
  });

  it('accrues only the elapsed hold portion and does not award its tail twice', () => {
    const index = createCalorieIndex([squatHold]);
    expect(caloriesAt(index, 1000)).toBeCloseTo(0.1242);
    expect(caloriesAt(index, 3000)).toBeCloseTo(0.2898);
    expect(caloriesAt(index, 5000)).toBeCloseTo(0.4554);
    expect(caloriesAt(index, 60000)).toBe(caloriesAt(index, 5000));
    // A paused frame and a backward seek are lookups, not additional exercise.
    expect(caloriesAt(index, 3000)).toBeCloseTo(0.2898);
    expect(caloriesAt(index, 3000)).toBeCloseTo(0.2898);
    expect(caloriesAt(index, 0)).toBe(0);
  });

  it('combines overlapping lanes and removes each hold rate at its own ending', () => {
    const notes: Note[] = [
      { id: 'punch', lane: 'punch', direction: 'right', kind: 'tap', timeMs: 3000 },
      squatHold,
      {
        id: 'step',
        lane: 'step',
        direction: 'left',
        kind: 'hold',
        modifier: 'none',
        timeMs: 2000,
        endTimeMs: 4000,
      },
    ];
    const before = structuredClone(notes);
    const index = createCalorieIndex(notes);
    expect(caloriesAt(index, 2000)).toBeCloseTo(0.214452);
    expect(caloriesAt(index, 3000)).toBeCloseTo(0.369702);
    expect(caloriesAt(index, 4000)).toBeCloseTo(0.475272);
    expect(caloriesAt(index, 5000)).toBeCloseTo(0.558072);
    expect(notes).toEqual(before);
  });

  it('keeps sub-tenth contributions instead of rounding every action to 0.1', () => {
    const punch: Note = { ...squat, lane: 'punch', direction: 'left' };
    expect(total([punch])).toBeCloseTo(0.04968);
    expect(total([punch]).toFixed(1)).toBe('0.0');
    expect(total([punch, { ...punch, id: 'second', timeMs: 2000 }]).toFixed(1)).toBe('0.1');
  });

  it('weights balancing above easy stepping and scales other charts by their actions', () => {
    const step: Note = { ...squat, lane: 'step', direction: 'left' };
    const balance: Note = { ...step, kind: 'hold', modifier: 'none', endTimeMs: 5000 };
    const sway: Note = { ...balance, modifier: 'sway' };
    expect(total([balance])).toBeGreaterThan(total([sway]));
    expect(total([sway])).toBeGreaterThan(total([step]));
    expect(total([step])).toBeGreaterThan(total([{ ...step, follow: true }]));
    expect(total([squatHold])).toBeGreaterThan(total([balance]));
    expect(total([step, { ...step, id: 'second', timeMs: 10000 }])).toBeCloseTo(total([step]) * 2);
  });

  it('uses chart time, including video offset, for the same arrival as the notes', () => {
    const chart = { ...blankChart(), videoOffsetMs: 200 };
    const index = createCalorieIndex([squat]);
    expect(caloriesAt(index, chartTimeAt(chart, 799))).toBe(0);
    expect(caloriesAt(index, chartTimeAt(chart, 800))).toBeCloseTo(0.1242);
  });
});
