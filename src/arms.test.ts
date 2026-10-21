import { describe, expect, it } from 'vitest';
import {
  ARM_DIRECTIONS,
  ARM_HANDS,
  armActionValue,
  armHand,
  blankChart,
  noteColor,
  parseChart,
  serializeChart,
  sortChart,
  type Note,
} from './model';
import {
  changeArmAction,
  changeArmGesture,
  changeNoteForm,
  flipNotes,
  historyReducer,
  setArmHand,
  shiftNoteLanes,
} from './editing';
import { noteGlyphShape } from './components/Glyph';
import { armDisplayNotes } from './armDisplay';

const reach: Note = {
  id: 'reach',
  lane: 'punch',
  direction: 'up_right',
  armAction: 'reach',
  hand: 'left',
  kind: 'hold',
  modifier: 'sway',
  timeMs: 1000,
  endTimeMs: 3000,
};
const legacy: Note = { id: 'old', lane: 'punch', direction: 'left', kind: 'tap', timeMs: 3500 };
const fixture = () => ({
  ...blankChart(),
  videoHint: { fileName: 'arms.mp4', durationMs: 20000 },
  notes: [reach, legacy],
});

describe('ARMS direction, hand and gesture remain independent', () => {
  it('前伸的左右手与双手可互换 TAP/HOLD/SWAY，保存与复制式属性转换保留动作和时长', () => {
    for (const hand of ['left', 'right', 'both'] as const)
      for (const type of ['tap', 'hold', 'sway'] as const) {
        const forward = changeArmAction(reach, `forward-${hand}`);
        const note = changeNoteForm(forward, type, 'forward', 5000);
        const chart = { ...fixture(), notes: [note] };
        expect(note).toMatchObject({
          armAction: 'forward',
          direction: 'forward',
          hand,
          id: reach.id,
          timeMs: reach.timeMs,
        });
        if (note.kind === 'hold') expect(note.endTimeMs).toBe(3000);
        expect(armActionValue(note)).toBe(`forward-${hand}`);
        expect(noteColor('punch', 'forward', hand, 'forward')).toBe(
          hand === 'both' ? 'var(--arms-both)' : hand === 'left' ? 'var(--cyan)' : 'var(--pink)',
        );
        expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(chart);
        expect(flipNotes(chart, [note.id]).notes[0].hand).toBe(
          hand === 'both' ? 'both' : hand === 'left' ? 'right' : 'left',
        );
        expect(flipNotes(flipNotes(chart, [note.id]), [note.id])).toEqual(chart);
        expect(setArmHand(chart, [note.id])).toEqual(chart);
        expect(shiftNoteLanes(chart, [note.id], 'punch', 'step')).toEqual(chart);
        expect(armDisplayNotes(chart.notes)).toEqual(chart.notes);
        expect(changeArmAction(note, 'punch-left').hand).toBeUndefined();
        expect(changeArmAction(note, 'up')).toMatchObject({
          armAction: 'reach',
          direction: 'up',
          hand,
        });
      }
  });
  it('前伸仅允许 ARMS 的 forward 方向和明确用手，旧拳套保持独立', () => {
    const forward = changeArmAction(reach, 'forward-left');
    for (const note of [
      { ...forward, hand: 'any' },
      { ...forward, hand: undefined },
      { ...forward, direction: 'left' },
      { ...forward, lane: 'step' },
      { ...forward, armAction: 'reach' },
      { ...forward, armAction: undefined },
    ])
      expect(() => parseChart({ ...fixture(), notes: [note] })).toThrow();
    expect(noteGlyphShape('punch', 'left').mirror).toBe(true);
    expect(noteGlyphShape('punch', 'right').mirror).toBe(false);
    expect(noteGlyphShape('punch', 'forward', 1, 'forward', 'left')).toMatchObject({
      shape: 'palm',
      angle: 0,
      mirror: true,
    });
    expect(noteGlyphShape('punch', 'forward', 1, 'forward', 'right').mirror).toBe(false);
    expect(armActionValue(legacy)).toBe('punch-left');
  });
  it('authors an outward two-hand preset as ordinary notes with a single compact display', () => {
    for (const type of ['tap', 'hold', 'sway'] as const) {
      const original = changeNoteForm(reach, type, reach.direction, 3000);
      const source = { ...fixture(), notes: [original, legacy] };
      const result = changeArmGesture(source, original.id, 'spread');
      const pair = result.chart.notes.filter((n) => result.ids.includes(n.id));
      expect(pair).toHaveLength(2);
      expect(pair[0]).toMatchObject({
        id: original.id,
        direction: 'left',
        hand: 'left',
        armAction: 'reach',
        kind: original.kind,
      });
      expect(pair[1]).toMatchObject({
        direction: 'right',
        hand: 'right',
        armAction: 'reach',
        timeMs: original.timeMs,
      });
      if (original.kind === 'hold')
        expect(pair[1]).toMatchObject({
          endTimeMs: original.endTimeMs,
          modifier: original.modifier,
        });
      expect(armDisplayNotes(pair)).toEqual([{ ...pair[0], pairedReach: pair[1].id }]);
      expect(parseChart(JSON.parse(serializeChart(result.chart)))).toEqual(result.chart);
      expect(source.notes).toEqual([original, legacy]);
      const back = changeArmGesture(result.chart, pair[0].id, 'up');
      expect(back.chart.notes).toHaveLength(2);
      expect(back.chart.notes[0]).toMatchObject({
        direction: 'up',
        hand: 'both',
        kind: original.kind,
      });
      expect(back.chart.notes[1]).toEqual(legacy);
      const repeated = changeArmGesture(result.chart, pair[0].id, 'spread');
      expect(repeated.ids).toEqual(result.ids);
      expect(repeated.chart).toEqual(result.chart);
      if (original.kind === 'hold')
        expect(armDisplayNotes([pair[0], { ...pair[1], endTimeMs: 4000 } as Note])).toHaveLength(2);
      expect(armDisplayNotes([pair[0], { ...pair[1], timeMs: 1200 }])).toHaveLength(2);
    }
  });
  it('pairs simultaneous matching gloves only in the display, never in saved/scored notes', () => {
    const left = changeArmAction(reach, 'punch-left');
    const right = { ...changeArmAction(reach, 'punch-right'), id: 'right' };
    const source = [left, right];
    expect(armDisplayNotes(source)).toEqual([{ ...left, pairedPunch: true }]);
    expect(source).toEqual([left, right]);
    expect(armDisplayNotes([left, { ...right, timeMs: 1100 }])).toHaveLength(2);
    expect(armDisplayNotes([left, { ...right, endTimeMs: 3100 } as Note])).toHaveLength(2);
    expect(armDisplayNotes([reach, { ...reach, id: 'other', hand: 'right' }])).toHaveLength(2);
  });
  it('round-trips every arrow/hand/form and keeps legacy frontal punches distinct', () => {
    const chart = fixture();
    chart.notes = [legacy];
    for (const direction of ARM_DIRECTIONS)
      for (const hand of ARM_HANDS)
        for (const type of ['tap', 'hold', 'sway'] as const) {
          const note = changeNoteForm(
            { ...reach, id: `${direction}-${hand.value}-${type}`, direction, hand: hand.value },
            type,
            direction,
            3000,
          );
          chart.notes.push(note);
        }
    expect(parseChart(JSON.parse(serializeChart(chart)))).toEqual(sortChart(chart));
    expect(armActionValue(legacy)).toBe('punch-left');
    expect(armHand(legacy)).toBe('left');
    expect(noteGlyphShape('punch', 'left').shape).toBe('glove');
    expect(noteGlyphShape('punch', 'left', 1, 'reach').shape).toBe('arrow');
  });
  it('F flips geometry/fists without changing hand, timing or sustain; H changes only arrow hand', () => {
    const chart = fixture();
    const reversed = flipNotes(chart, ['reach', 'old']);
    expect(reversed.notes).toEqual([
      { ...reach, direction: 'down_left' },
      { ...legacy, direction: 'right' },
    ]);
    expect(flipNotes(reversed, ['reach', 'old'])).toEqual(chart);
    let changed = chart;
    for (const hand of ['right', 'both', undefined, 'left']) {
      changed = setArmHand(changed, ['reach', 'old']);
      expect(changed.notes[0].hand).toBe(hand);
      expect(changed.notes[0]).toMatchObject({
        direction: reach.direction,
        timeMs: 1000,
        endTimeMs: 3000,
        modifier: 'sway',
      });
      expect(changed.notes[1]).toEqual(legacy);
    }
    const history = historyReducer(
      { past: [], present: chart, future: [] },
      { type: 'edit', chart: setArmHand(chart, ['reach'], 'both') },
    );
    expect(historyReducer(history, { type: 'undo' }).present).toEqual(chart);
  });
  it('switches arrow/fist and TAP/HOLD/SWAY without losing sustain duration', () => {
    const punch = changeArmAction(reach, 'punch-right');
    expect(punch).toMatchObject({ armAction: 'punch', direction: 'right', endTimeMs: 3000 });
    expect(punch.hand).toBeUndefined();
    const arrow = changeArmAction(punch, 'down_left');
    expect(arrow).toMatchObject({ armAction: 'reach', direction: 'down_left', endTimeMs: 3000 });
    expect(changeNoteForm(arrow, 'hold', arrow.direction, 9000)).toMatchObject({
      armAction: 'reach',
      endTimeMs: 3000,
      modifier: 'none',
    });
    expect(changeNoteForm(reach, 'tap', reach.direction, 9000)).toEqual({
      id: reach.id,
      lane: 'punch',
      direction: 'up_right',
      armAction: 'reach',
      hand: 'left',
      timeMs: 1000,
      kind: 'tap',
    });
  });
  it('rejects invalid arm attributes and cleans them when crossing into another lane', () => {
    for (const note of [
      { ...reach, armAction: 'punch' },
      { ...legacy, hand: 'both' },
      { ...reach, lane: 'squat' },
      { ...reach, hand: 'unknown' },
    ])
      expect(() => parseChart({ ...fixture(), notes: [note] })).toThrow();
    const chart = { ...fixture(), notes: [{ ...reach, direction: 'left' as const }] };
    const moved = shiftNoteLanes(chart, ['reach'], 'punch', 'side_crunch');
    expect(moved.notes[0].hand).toBeUndefined();
    expect(moved.notes[0].armAction).toBeUndefined();
    expect(parseChart(moved)).toEqual(moved);
    const back = shiftNoteLanes(moved, ['reach'], 'side_crunch', 'punch');
    expect(back.notes[0].armAction).toBe('reach');
    expect(noteColor('punch', 'up', 'left', 'reach')).toBe('var(--cyan)');
    expect(noteColor('punch', 'up', 'both', 'reach')).toBe('var(--arms-both)');
  });
});
