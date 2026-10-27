import { useLayoutEffect, useRef, useState } from 'react';
import { AudioLines, Crosshair } from 'lucide-react';
import type { BpmResponse, DetectionCandidates } from '../bpm';

export function BpmDetectButton({
  source,
  start,
  end,
  bpm,
  onDetected,
  notify,
  mode = 'bpm',
  anchor,
  beatsPerBar = 4,
}: {
  source: string;
  start: number;
  end: number;
  bpm: number;
  onDetected: (bpm: number) => void;
  notify: (message: string) => void;
  mode?: 'bpm' | 'first-beat';
  anchor?: number;
  beatsPerBar?: 3 | 4;
}) {
  const name = mode === 'first-beat' ? '第一拍' : 'BPM';
  const [progress, setProgress] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<DetectionCandidates | null>(null);
  const job = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);
  const callbacks = useRef({ onDetected, notify });
  callbacks.current = { onDetected, notify };
  const cancel = () => {
    if (job.current) {
      job.current.worker.terminate();
      clearTimeout(job.current.timer);
      job.current = null;
    }
  };
  // Cancel synchronously when the target changes, before an old worker can reply.
  useLayoutEffect(() => {
    setProgress(null);
    setCandidates(null);
    return cancel;
  }, [source, start, end, bpm, mode, anchor, beatsPerBar]);
  const detect = () => {
    if (!source || job.current) return;
    setCandidates(null);
    const finish = (message: string) => {
      cancel();
      setProgress(null);
      callbacks.current.notify(message);
    };
    try {
      const worker = new Worker(new URL('../bpm.worker.ts', import.meta.url), { type: 'module' });
      const timer = setTimeout(() => {
        if (job.current?.worker === worker) finish(`${name}检测超时，请重试或手动填写。`);
      }, 60000);
      job.current = { worker, timer };
      setProgress(0);
      worker.onmessage = ({ data }: MessageEvent<BpmResponse>) => {
        if (job.current?.worker !== worker) return;
        if ('progress' in data) setProgress(data.progress);
        else if ('error' in data) finish(data.error);
        else if ('candidates' in data) {
          finish(
            data.candidates.kind === 'bpm'
              ? '检测有多个 BPM 候选，可能是拍子分组歧义或变速。原 BPM 未修改，请点选候选或手动填写。'
              : '检测到多个起点候选，尚未确认小节第一拍。Offset 未修改，请试听后选择或手动填写。',
          );
          setCandidates(data.candidates);
        } else if ('firstBeat' in data) {
          finish(
            `${data.firstBeat.pattern ? '重复乐句推算的' : data.firstBeat.rhythmRepeat ? '重复节奏推算的' : ''}第一拍候选 ${(data.firstBeat.timeMs / 1000).toFixed(3)} 秒（视频时间），已填入；${data.firstBeat.pattern?.edgeSnapMs ? '接近视频边界，已取非负起点；' : ''}请试听确认小节强拍。`,
          );
          callbacks.current.onDetected(data.firstBeat.timeMs);
        } else {
          const detected = data.result.bpm;
          finish(`检测到 ${detected} BPM，已填入当前节拍段。`);
          callbacks.current.onDetected(detected);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (job.current?.worker !== worker) return;
        finish(`${name}检测无法启动，请重试或手动填写。`);
      };
      worker.postMessage({
        source,
        start,
        end,
        ...(mode === 'first-beat' ? { firstBeatBpm: bpm, beatsPerBar } : {}),
      });
    } catch {
      finish(`${name}检测无法启动，请重试或手动填写。`);
    }
  };
  return (
    <>
      <button
        className="bpm-detect"
        type="button"
        aria-label={`自动检测${mode === 'bpm' ? ' BPM' : '第一拍'}`}
        aria-busy={progress !== null}
        title={
          source
            ? mode === 'bpm'
              ? '从当前视频音频检测本段 BPM'
              : '按当前 BPM 估算第一拍候选；仅调整网格，不移动音符，可撤销'
            : '请先选择视频'
        }
        disabled={!source || progress !== null}
        onClick={detect}
      >
        {mode === 'bpm' ? (
          <AudioLines size={11} aria-hidden="true" />
        ) : (
          <Crosshair size={11} aria-hidden="true" />
        )}
        {progress === null ? '检测' : `${progress}%`}
      </button>
      {candidates && (
        <div
          className="bpm-candidates"
          role="group"
          aria-label={candidates.kind === 'bpm' ? 'BPM 检测候选' : '第一拍检测候选'}
        >
          <div className="bpm-candidates-heading">
            <span>{candidates.kind === 'bpm' ? '候选' : '候选起点 / 视频时间'} · 点选填入</span>
            <button type="button" aria-label="收起检测候选" onClick={() => setCandidates(null)}>
              收起
            </button>
          </div>
          <div className="inspector-actions">
            {candidates.values.map((value) => {
              const label =
                candidates.kind === 'bpm' ? `${value} BPM` : `${(value / 1000).toFixed(3)} s`;
              return (
                <button
                  type="button"
                  key={value}
                  aria-label={`采用 ${label}`}
                  onClick={() => {
                    callbacks.current.onDetected(value);
                    callbacks.current.notify(
                      `已采用 ${label}；${candidates.kind === 'bpm' ? '可试听确认节拍。' : '请试听确认小节强拍，可用两拍按钮纠正。'}`,
                    );
                    setCandidates(null);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
