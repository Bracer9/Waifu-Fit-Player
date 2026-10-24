import { useMemo, useState } from 'react';
import { fitnessPatterns, type PatternRequest } from '../fitness/patterns';
import { LANES } from '../model';
import './fitness-patterns.css';

export const FITNESS_PATTERN_MIME = 'application/x-wfp-fitness-pattern';
type Props = {
  onInsert: (request: PatternRequest) => void;
  onDrag: (value: (PatternRequest & { beats: number }) | null) => void;
};
export default function FitnessPatternPanel({ onInsert, onDrag }: Props) {
  const [filter, setFilter] = useState('all');
  const [chosen, setChosen] = useState(fitnessPatterns[0].id);
  const [repeats, setRepeats] = useState(2);
  const [mirror, setMirror] = useState(false);
  const patterns = useMemo(
    () => fitnessPatterns.filter((p) => filter === 'all' || p.lanes.includes(filter)),
    [filter],
  );
  const pattern = fitnessPatterns.find((p) => p.id === chosen)!;
  const effectiveRepeats = pattern.mirrorRequired && repeats === 1 ? 2 : repeats;
  const request = { id: chosen, repeats, mirror };
  return (
    <div className="fitness-patterns">
      <div className="fitness-pattern-heading">
        <b>FITNESS / 积木</b>
      </div>
      <label className="field">
        <span>动作类别</span>
        <select
          aria-label="积木动作类别"
          value={filter}
          onChange={(e) => {
            const next = e.target.value;
            setFilter(next);
            if (next !== 'all' && !pattern.lanes.includes(next))
              setChosen(fitnessPatterns.find((p) => p.lanes.includes(next))!.id);
          }}
        >
          <option value="all">全部组合</option>
          {LANES.filter((l) => l.id !== 'step').map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <div className="fitness-pattern-options">
        <label className="field">
          <span>重复组数</span>
          <select
            aria-label="积木重复组数"
            value={repeats}
            onChange={(e) => setRepeats(Number(e.target.value))}
          >
            {[1, 2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n} 组
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="fitness-pattern-mirror">
        <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
        左右镜像
      </label>
      <button className="fitness-pattern-insert" onClick={() => onInsert(request)}>
        插入并前进
      </button>
      <p className="fitness-pattern-hint">
        当前 {(pattern.beats / 4) * effectiveRepeats} 小节
        {pattern.mirrorRequired ? ' · 左右成对' : ''}
        。单击选取，双击插入；也可拖到时间轴。按整小节吸附，已有动作不会覆盖，可撤销。
      </p>
      <div className="fitness-pattern-list" aria-label="Fitness 积木库">
        {patterns.map((p) => {
          const count = p.mirrorRequired && repeats === 1 ? 2 : repeats;
          return (
            <button
              key={p.id}
              className="fitness-pattern-card"
              aria-pressed={chosen === p.id}
              data-pattern-id={p.id}
              draggable
              onClick={() => setChosen(p.id)}
              onDoubleClick={() => onInsert({ id: p.id, repeats, mirror })}
              onDragStart={(e) => {
                const next = { id: p.id, repeats, mirror };
                setChosen(p.id);
                e.dataTransfer.setData(FITNESS_PATTERN_MIME, JSON.stringify(next));
                e.dataTransfer.effectAllowed = 'copy';
                onDrag({ ...next, beats: p.beats * count });
              }}
              onDragEnd={() => onDrag(null)}
            >
              <b>{p.label}</b>
              <span>
                {p.mirrorRequired ? '左右配对' : '完整循环'} · {p.sources.length} 处参考
              </span>
              <svg viewBox="0 0 180 28" aria-hidden="true">
                {['squat', 'punch', 'calf_raise', 'side_crunch'].map((lane, i) => (
                  <g key={lane} fill={LANES.find((l) => l.id === lane)!.color}>
                    <path d={`M0 ${i * 7 + 3}H180`} stroke="currentColor" opacity=".15" />
                    {p.notes
                      .filter((n) => n.lane === lane)
                      .map((n, j) => (
                        <rect
                          key={j}
                          x={(n.at / p.beats) * 176}
                          y={i * 7}
                          width={
                            n.kind === 'hold' ? Math.max(3, ((n.duration ?? 1) / p.beats) * 176) : 3
                          }
                          height="5"
                          rx="1"
                        />
                      ))}
                  </g>
                ))}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
