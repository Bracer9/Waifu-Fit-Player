import { useEffect, useRef, useState } from 'react';
import { WandSparkles } from 'lucide-react';
import type { Chart } from '../model';
import type { FitnessMessage, FitnessResult } from '../fitness/generate';
import { ModalBackdrop } from './ModalBackdrop';
import { formatTime } from '../timing';
import './fitness-generator.css';

function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function FitnessGenerateButton({
  chart,
  source,
  disabled,
  onStart,
  onApply,
}: {
  chart: Chart;
  source: string;
  disabled: boolean;
  onStart: () => void;
  onApply: (result: FitnessResult) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false),
    [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState(''),
    [error, setError] = useState(''),
    [result, setResult] = useState<FitnessResult | null>(null);
  const [applied, setApplied] = useState(false),
    [saving, setSaving] = useState(false);
  const job = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);
  const apply = useRef(onApply);
  apply.current = onApply;
  const cancel = () => {
    if (job.current) {
      job.current.worker.terminate();
      clearTimeout(job.current.timer);
      job.current = null;
    }
  };
  useEffect(() => {
    setOpen(false);
    setResult(null);
    setProgress(null);
    setError('');
    setApplied(false);
    return cancel;
  }, [source, chart.songId]);
  const close = () => {
    if (saving) return;
    cancel();
    setProgress(null);
    setOpen(false);
  };
  const start = () => {
    if (job.current || saving || !source) return;
    onStart();
    setOpen(true);
    setResult(null);
    setApplied(false);
    setError('');
    setProgress(0);
    setPhase('准备本地音轨分析');
    try {
      const worker = new Worker(new URL('../fitness/fitness.worker.ts', import.meta.url), {
        type: 'module',
      });
      const fail = (message: string) => {
        cancel();
        setProgress(null);
        setError(message);
      };
      job.current = {
        worker,
        timer: setTimeout(() => fail('分析超时，已停止，原谱面未修改。'), 180000),
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail('无法运行本地生成器，原谱面未修改。');
      };
      worker.onmessage = async ({ data }: MessageEvent<FitnessMessage>) => {
        if (job.current?.worker !== worker) return;
        if ('progress' in data) {
          setProgress(data.progress);
          setPhase(data.phase);
          return;
        }
        if ('error' in data) {
          fail(data.error);
          return;
        }
        cancel();
        setProgress(null);
        setResult(data.result);
        setSaving(true);
        setPhase('保存 FITNESS 草稿');
        try {
          setApplied(await apply.current(data.result));
        } catch (e) {
          setError(
            `生成已完成，但保存失败：${e instanceof Error ? e.message : '未知错误'}。可下载谱面副本。`,
          );
        } finally {
          setSaving(false);
        }
      };
      worker.postMessage({ source, chart: structuredClone(chart) });
    } catch {
      cancel();
      setProgress(null);
      setError('生成器无法启动，原谱面未修改。');
    }
  };
  return (
    <>
      <button
        type="button"
        className="button small ghost"
        disabled={disabled || !source || progress !== null || saving}
        onClick={start}
        title="本地分析音乐并按参考积木生成四轨 FITNESS 草稿"
      >
        <WandSparkles size={15} />
        一键 FITNESS
      </button>
      {result && !open && (
        <button type="button" className="button small ghost" onClick={() => setOpen(true)}>
          生成报告
        </button>
      )}
      {open && (
        <ModalBackdrop onClose={close}>
          <section
            className="modal fitness-generation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fitness-generation-title"
          >
            <div className="eyebrow">FITNESS / PATTERN BUILDER</div>
            <h2 id="fitness-generation-title">
              {result ? 'FITNESS 生成完成' : '生成 FITNESS 谱面'}
            </h2>
            <p>本地音乐分析 · 三首参考谱积木 · 四轨编排</p>
            {progress !== null && (
              <>
                <p role="status">
                  {phase} · {progress}%
                </p>
                <progress aria-label="FITNESS 生成进度" max={100} value={progress} />
              </>
            )}
            {error && <p role="alert">{error}</p>}
            {saving && <p role="status">正在保存草稿…</p>}
            {result && !saving && (
              <>
                <p role="status">
                  {applied
                    ? '已保存到本曲 FITNESS 草稿，未发布。'
                    : '生成结果未写入，可下载谱面副本。'}
                </p>
                <dl className="fitness-summary">
                  <div>
                    <dt>BPM</dt>
                    <dd>{result.report.bpm}</dd>
                  </div>
                  <div>
                    <dt>起始拍点</dt>
                    <dd>{(result.report.audioStartMs / 1000).toFixed(3)}s</dd>
                  </div>
                  <div>
                    <dt>动作</dt>
                    <dd>{result.report.noteCount}</dd>
                  </div>
                  <div>
                    <dt>段落</dt>
                    <dd>{result.report.sections.length}</dd>
                  </div>
                </dl>
                <p>
                  {Object.entries(result.report.laneCounts)
                    .map(
                      ([lane, count]) =>
                        `${({ squat: '蹲起', punch: '手臂', calf_raise: '踮脚', side_crunch: '侧收腹' } as Record<string, string>)[lane]} ${count}`,
                    )
                    .join(' · ')}
                </p>
                <details>
                  <summary>编排明细与音乐关联</summary>
                  <ol>
                    {result.report.sections.map((s, i) => (
                      <li key={i}>
                        {formatTime(s.startMs)}–{formatTime(s.endMs)} · {s.label} ×{s.repeats}
                        {s.mirrored ? ' · 左右镜像配对' : ''}
                        {s.musicMatch
                          ? ` · 与第 ${s.musicMatch.section} 段音乐相似 ${Math.round(s.musicMatch.similarity * 100)}%${s.musicMatch.reused ? '，复用组合' : ''}`
                          : ''}
                      </li>
                    ))}
                  </ol>
                </details>
                <p className="fitness-caveat">{result.report.warnings.join(' ')}</p>
              </>
            )}
            <div className="modal-actions">
              {result && (
                <>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => download(result.report, `${chart.title}-fitness-report.json`)}
                  >
                    下载报告
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => download(result.chart, `${chart.title}-fitness.wfp.json`)}
                  >
                    谱面副本
                  </button>
                </>
              )}
              <button type="button" className="button primary" disabled={saving} onClick={close}>
                {progress !== null ? '取消生成' : '关闭'}
              </button>
            </div>
          </section>
        </ModalBackdrop>
      )}
    </>
  );
}
