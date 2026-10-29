import { expect, it } from 'vitest';
import { blankChart, parseChart, type Chart } from './model';
import {
  changeSelectedForms,
  changeSelectedDirections,
  commonNoteDirections,
  changeArmGesture,
  historyReducer,
} from './editing';

function fixture(): Chart {
  return {
    ...blankChart(),
    videoHint: { fileName: 'test.mp4', durationMs: 10000 },
    tempoSegments: [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' }],
    notes: [
      {
        id: 'left',
        lane: 'punch',
        direction: 'left',
        armAction: 'reach',
        hand: 'left',
        kind: 'tap',
        timeMs: 1000,
      },
      {
        id: 'clap',
        lane: 'punch',
        direction: 'forward',
        armAction: 'clap',
        hand: 'both',
        kind: 'hold',
        modifier: 'none',
        timeMs: 2000,
        endTimeMs: 3500,
      },
      { id: 'step', lane: 'step', direction: 'right', foot: 'right', kind: 'tap', timeMs: 4000 },
      { id: 'keep', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 6000 },
    ],
  };
}
it('converts mixed selected notes together, preserves independent attributes and undoes in one edit', () => {
  const original = fixture();
  const before = structuredClone(original);
  const ids = ['left', 'clap', 'step'];
  const next = changeSelectedForms(original, ids, 'sway', 10000);
  expect(original).toEqual(before);
  expect(next.notes.map((n) => n.id)).toEqual(original.notes.map((n) => n.id));
  expect(next.notes[0]).toMatchObject({
    direction: 'left',
    hand: 'left',
    modifier: 'sway',
    endTimeMs: 1500,
  });
  expect(next.notes[1]).toMatchObject({
    armAction: 'clap',
    hand: 'both',
    modifier: 'sway',
    endTimeMs: 3500,
  });
  expect(next.notes[2]).toMatchObject({
    direction: 'right',
    foot: 'right',
    modifier: 'sway',
    endTimeMs: 4500,
  });
  expect(next.notes[3]).toBe(original.notes[3]);
  expect(parseChart(next)).toEqual(next);
  const history = historyReducer(
    { past: [], present: original, future: [] },
    { type: 'edit', chart: next },
  );
  expect(historyReducer(history, { type: 'undo' }).present).toEqual(original);
  const taps = changeSelectedForms(next, ids, 'tap', 10000);
  for (const note of taps.notes) {
    expect(note.kind).toBe('tap');
    expect(note).not.toHaveProperty('modifier');
    expect(note).not.toHaveProperty('endTimeMs');
  }
});
it('handles STEP-only forms without leaking STEP properties into other lanes', () => {
  const chart = fixture();
  const spin = changeSelectedForms(chart, ['step'], 'free-sway', 10000);
  expect(spin.notes[2]).toMatchObject({ direction: 'free', modifier: 'sway', foot: 'right' });
  expect(parseChart(changeSelectedForms(spin, ['step'], 'tap', 10000)).notes[2]).toMatchObject({
    direction: 'left',
    kind: 'tap',
    foot: 'right',
  });
  expect(() => changeSelectedForms(chart, ['left', 'step'], 'follow', 10000)).toThrow(
    '仅支持 STEP',
  );
});
it('converts selected SPECIAL and notes together only to their common forms', () => {
  const chart = fixture();
  chart.specialEvents = [{ id: 'special', timeMs: 3000 }];
  const held = changeSelectedForms(chart, ['left', 'special'], 'hold', 10000);
  expect(held.notes[0]).toMatchObject({ kind: 'hold', endTimeMs: 1500 });
  expect(held.specialEvents).toEqual([{ id: 'special', timeMs: 3000, endTimeMs: 3500 }]);
  expect(() => changeSelectedForms(chart, ['left', 'special'], 'sway', 10000)).toThrow('SPECIAL');
  expect(changeSelectedForms(held, ['left', 'special'], 'tap', 10000).specialEvents).toEqual(
    chart.specialEvents,
  );
});
it('rejects the whole conversion when any selected tap has no room at the end', () => {
  const chart = fixture();
  chart.notes[2].timeMs = 10000;
  const before = structuredClone(chart);
  expect(() => changeSelectedForms(chart, ['left', 'step'], 'hold', 10000)).toThrow('整批未修改');
  expect(chart).toEqual(before);
});

it('changes compatible directions in one edit while retaining forms, timing and legacy foot colours', () => {
  const chart = fixture();
  chart.notes.push({
    id: 'side',
    lane: 'side_crunch',
    direction: 'left',
    kind: 'hold',
    modifier: 'none',
    timeMs: 6500,
    endTimeMs: 7500,
  });
  chart.specialEvents = [{ id: 'special', timeMs: 9000 }];
  chart.specialMove = { name: 'test', icon: 'star', previewBeats: 4 };
  const next = changeSelectedDirections(chart, ['step', 'side', 'special'], 'right');
  expect(next.chart.notes[2]).toMatchObject({
    direction: 'right',
    foot: 'right',
    kind: 'tap',
    timeMs: 4000,
  });
  expect(next.chart.notes[4]).toMatchObject({
    direction: 'right',
    foot: 'left',
    kind: 'hold',
    modifier: 'none',
    timeMs: 6500,
    endTimeMs: 7500,
  });
  expect(next.chart.specialEvents).toBe(chart.specialEvents);
  expect(next.ids).toEqual(['step', 'side', 'special']);
  expect(parseChart(next.chart)).toEqual(next.chart);
  const history = historyReducer(
    { past: [], present: chart, future: [] },
    { type: 'edit', chart: next.chart },
  );
  expect(historyReducer(history, { type: 'undo' }).present).toEqual(chart);
  expect(commonNoteDirections([chart.notes[2], chart.notes[3]])).toEqual([]);
  expect(() => changeSelectedDirections(chart, ['step', 'keep'], 'up')).toThrow('整批未修改');
});

it('converts each selected arm direction, handles spread once, and keeps non-arm selection', () => {
  const chart = fixture();
  const spread = changeArmGesture(chart, 'left', 'spread');
  const original = structuredClone(spread.chart);
  const ids = [...spread.ids, 'clap'];
  const next = changeSelectedDirections(spread.chart, ids, 'up');
  expect(spread.chart).toEqual(original);
  const arms = next.chart.notes.filter((n) => n.lane === 'punch');
  expect(arms).toHaveLength(2);
  expect(
    arms.every((n) => n.direction === 'up' && n.armAction === 'reach' && n.hand === 'both'),
  ).toBe(true);
  expect(arms.find((n) => n.id === 'clap')).toMatchObject({
    kind: 'hold',
    modifier: 'none',
    endTimeMs: 3500,
  });
  expect(next.ids).toHaveLength(2);
  expect(parseChart(next.chart)).toEqual(next.chart);
  const mixed = changeSelectedDirections(chart, ['left', 'step'], 'right');
  expect(mixed.chart.notes[0]).toMatchObject({
    direction: 'right',
    hand: 'left',
    armAction: 'reach',
  });
  expect(mixed.chart.notes[2]).toMatchObject({ direction: 'right', foot: 'right' });
});

it('preserves SPIN sustain form when choosing a horizontal direction and removes spin-only metadata', () => {
  const chart = changeSelectedForms(fixture(), ['step'], 'free-sway', 10000);
  chart.notes[2].spinDirection = 'counterclockwise';
  const next = changeSelectedDirections(chart, ['step'], 'left').chart;
  expect(next.notes[2]).toMatchObject({
    direction: 'left',
    kind: 'hold',
    modifier: 'sway',
    endTimeMs: 4500,
    foot: 'right',
  });
  expect(next.notes[2]).not.toHaveProperty('spinDirection');
  expect(parseChart(next)).toEqual(next);
});
