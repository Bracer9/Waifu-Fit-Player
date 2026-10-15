import { sortChart, type Chart, type Lane, type Direction } from './model';
export function demoChart(fileName: string): Chart {
  const chart: Chart = {
    schemaVersion: 1,
    title: '爽快奪回 Sunlight',
    videoHint: { fileName, durationMs: 266775 },
    specialMove: { name: '比心 / HEART POSE', icon: 'heart', previewBeats: 3 },
    tempoSegments: [{ id: 'demo-tempo', anchorMs: 2000, bpm: 150, meter: '4/4' }],
    notes: [],
    specialEvents: [],
  };
  let index = 0;
  const tap = (lane: Lane, direction: Direction, beat: number, distance?: 2) =>
    chart.notes.push({
      id: `demo-${index++}`,
      lane,
      direction,
      kind: 'tap',
      timeMs: 2000 + beat * 400,
      ...(distance ? { distance } : {}),
    });
  const stepHold = (
    direction: Direction,
    beat: number,
    end: number,
    modifier: 'none' | 'sway' = 'none',
  ) =>
    chart.notes.push({
      id: `demo-${index++}`,
      lane: 'step',
      direction,
      kind: 'hold',
      modifier,
      timeMs: 2000 + beat * 400,
      endTimeMs: 2000 + end * 400,
    });
  for (let bar = 0; bar < 80; bar++) {
    const b = bar * 8;
    if (bar % 8 === 7) {
      chart.specialEvents.push({
        id: `special-${bar}`,
        timeMs: 2000 + b * 400,
        endTimeMs: 2000 + (b + 4) * 400,
      });
      continue;
    }
    if (bar % 4 === 0) {
      chart.notes.push({
        id: `demo-${index++}`,
        lane: 'squat',
        direction: 'down',
        kind: 'hold',
        modifier: bar % 8 === 0 ? 'sway' : 'none',
        timeMs: 2000 + b * 400,
        endTimeMs: 2000 + (b + 4) * 400,
      });
      tap('squat', 'up', b + 4);
    } else if (bar % 4 === 1) {
      tap('punch', 'left', b);
      tap('punch', 'right', b + 2);
      tap('punch', 'left', b + 4);
      tap('punch', 'right', b + 6);
    } else if (bar % 4 === 2) {
      tap('calf_raise', 'up', b);
      tap('calf_raise', 'down', b + 2);
      tap('calf_raise', 'up', b + 4);
      tap('calf_raise', 'down', b + 6);
    } else {
      tap('side_crunch', 'left', b);
      tap('side_crunch', 'right', b + 4);
    }
    if (bar % 8 === 1) {
      tap('step', 'left', b);
      tap('step', 'close', b + 1);
      tap('step', 'right', b + 2, 2);
      tap('step', 'close', b + 3);
      tap('step', 'left', b + 4, 2);
      tap('step', 'close', b + 5);
      tap('step', 'right', b + 6);
      tap('step', 'close', b + 7);
    } else if (bar % 8 === 3) {
      stepHold('left', b, b + 2);
      stepHold('close', b + 2, b + 4);
      tap('step', 'right', b + 5);
      tap('step', 'close', b + 6);
    } else if (bar % 8 === 5) {
      stepHold('right', b, b + 3, 'sway');
      tap('step', 'close', b + 3);
      stepHold('left', b + 4, b + 7, 'sway');
      tap('step', 'close', b + 7);
    }
  }
  return sortChart(chart);
}
