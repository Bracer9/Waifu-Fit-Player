import { useLayoutEffect, useRef, useState } from 'react';
import { AudioLines } from 'lucide-react';
import type { BpmResponse } from '../bpm';

export function BpmDetectButton({
  source,
  start,
  end,
  bpm,
  onDetected,
  notify,
}: {
  source: string;
  start: number;
  end: number;
  bpm: number;
  onDetected: (bpm: number) => void;
  notify: (message: string) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
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
    return cancel;
  }, [source, start, end, bpm]);
  const detect = () => {
    if (!source || job.current) return;
    const finish = (message: string) => {
      cancel();
      setProgress(null);
      callbacks.current.notify(message);
    };
    try {
      const worker = new Worker(new URL('../bpm.worker.ts', import.meta.url), { type: 'module' });
      const timer = setTimeout(() => {
        if (job.current?.worker === worker) finish('BPM 检测超时，请重试或手动填写。');
      }, 60000);
      job.current = { worker, timer };
      setProgress(0);
      worker.onmessage = ({ data }: MessageEvent<BpmResponse>) => {
        if (job.current?.worker !== worker) return;
        if ('progress' in data) setProgress(data.progress);
        else if ('error' in data) finish(data.error);
        else {
          const detected = data.result.bpm;
          finish(`检测到 ${detected} BPM，已填入当前节拍段。`);
          callbacks.current.onDetected(detected);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (job.current?.worker !== worker) return;
        finish('BPM 检测无法启动，请重试或手动填写。');
      };
      worker.postMessage({ source, start, end });
    } catch {
      finish('BPM 检测无法启动，请重试或手动填写。');
    }
  };
  return (
    <button
      className="bpm-detect"
      type="button"
      aria-label="自动检测 BPM"
      aria-busy={progress !== null}
      title={source ? '从当前视频音频检测本段 BPM' : '请先选择视频'}
      disabled={!source || progress !== null}
      onClick={detect}
    >
      <AudioLines size={11} aria-hidden="true" />
      {progress === null ? '检测' : `${progress}%`}
    </button>
  );
}
