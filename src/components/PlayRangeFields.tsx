import { useEffect, useMemo, useState } from 'react';
import { Crosshair } from 'lucide-react';
import type { Chart, PlayRange } from '../model';
import type { MediaController } from '../media';
import { formatTime } from '../timing';
import {
  parsePlayTime,
  playRangeCrossings,
  videoPlayRange,
  type RangeCrossing,
} from '../play-range';

function RangeTimeField({
  label,
  timeMs,
  disabled,
  onCommit,
  notify,
}: {
  label: string;
  timeMs: number;
  disabled: boolean;
  onCommit: (timeMs: number) => boolean;
  notify: (message: string) => void;
}) {
  const formatted = formatTime(timeMs, true);
  const [draft, setDraft] = useState(formatted);
  useEffect(() => setDraft(formatted), [formatted]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        disabled={disabled}
        placeholder="03:41.000"
        title="视频时间：03:41.000 或 221 秒；回车确认"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          const parsed = parsePlayTime(event.currentTarget.value);
          if (parsed === undefined) {
            notify('请输入视频时间，如 03:41.000 或 221（秒）。');
            setDraft(formatted);
          } else setDraft(onCommit(parsed) ? formatTime(parsed, true) : formatted);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.value = formatted;
            setDraft(formatted);
            event.currentTarget.blur();
          } else if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function PlayRangeWarnings({
  issues,
  onLocate,
}: {
  issues: RangeCrossing[];
  onLocate: (id: string) => void;
}) {
  if (!issues.length) return null;
  return (
    <div className="play-range-warnings" role="alert">
      <p>以下长条跨过游玩区间边界，发布前请调整：</p>
      <div className="play-range-issue-list">
        {issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => onLocate(issue.id)}
            aria-label={`定位 ${issue.label} ${formatTime(issue.timeMs, true)}`}
          >
            <span>
              {issue.label} · {formatTime(issue.timeMs, true)}
            </span>
            <span>定位 ↗</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PlayRangeFields({
  chart,
  media,
  durationMs,
  onChange,
  onLocate,
  notify,
}: {
  chart: Chart;
  media: MediaController;
  durationMs: number;
  onChange: (range: PlayRange | undefined) => void;
  onLocate: (id: string) => void;
  notify: (message: string) => void;
}) {
  const range = videoPlayRange(chart, durationMs);
  const issues = useMemo(() => playRangeCrossings(chart), [chart]);
  const disabled = !durationMs;
  const commit = (edge: keyof PlayRange, timeMs: number) => {
    const next = { ...range, [edge]: timeMs };
    if (
      !Number.isSafeInteger(timeMs) ||
      next.startMs < 0 ||
      next.endMs > durationMs ||
      next.endMs <= next.startMs
    ) {
      notify('游玩终点必须晚于起点，且起止位置不能超出视频。');
      return false;
    }
    if (next.startMs !== range.startMs || next.endMs !== range.endMs)
      onChange(next.startMs === 0 && next.endMs === durationMs ? undefined : next);
    return true;
  };
  return (
    <section className="play-range-fields" aria-label="游玩区间">
      <div className="play-range-heading">
        <strong>
          游玩区间 <small>视频时间</small>
        </strong>
        <button type="button" disabled={!chart.playRange} onClick={() => onChange(undefined)}>
          完整视频
        </button>
      </div>
      <div className="field-pair">
        {(['startMs', 'endMs'] as const).map((edge) => (
          <div key={edge}>
            <RangeTimeField
              label={edge === 'startMs' ? '游玩开始' : '游玩结束'}
              timeMs={range[edge]}
              disabled={disabled}
              onCommit={(time) => commit(edge, time)}
              notify={notify}
            />
            <button
              className="play-range-current"
              type="button"
              disabled={disabled}
              aria-label={edge === 'startMs' ? '当前位置设为游玩起点' : '当前位置设为游玩终点'}
              onClick={() => commit(edge, Math.round(media.getTime()))}
            >
              <Crosshair size={11} /> 用当前位置
            </button>
          </div>
        ))}
      </div>
      <p className="play-range-duration">
        游玩 {formatTime(range.endMs - range.startMs)}{' '}
        <span>/ 原视频 {formatTime(durationMs)}</span>
      </p>
      <PlayRangeWarnings issues={issues} onLocate={onLocate} />
    </section>
  );
}
