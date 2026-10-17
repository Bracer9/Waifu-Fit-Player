import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MediaController } from '../media';
import { prepareVideoFrame } from '../usePlayerPreparation';
import { EXPORT_PRESETS, exportSize, mp4RecordingType, recordVideo } from '../video-export';
import { ModalBackdrop } from './ModalBackdrop';

type CaptureDevices = MediaDevices & {
  setCaptureHandleConfig?: (config: { handle?: string; permittedOrigins?: string[] }) => void;
};
type CaptureTrack = MediaStreamTrack & { getCaptureHandle?: () => { handle: string } | null };

async function waitForCaptureLayout(signal: AbortSignal) {
  // Chrome's sharing bar appears asynchronously and changes the viewport height.
  // Read the output aspect only after that transition, before starting the song.
  const started = performance.now();
  let unchangedSince = started;
  let size = `${innerWidth}:${innerHeight}`;
  while (performance.now() - started < 3000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    signal.throwIfAborted();
    const next = `${innerWidth}:${innerHeight}`;
    if (next !== size) {
      size = next;
      unchangedSince = performance.now();
    }
    if (performance.now() - started >= 600 && performance.now() - unchangedSince >= 300) return;
  }
  throw new Error('窗口尺寸仍在变化，请保持 F11 全屏后重新导出。');
}

export function VideoExport({
  media,
  title,
  onModeChange,
  onClose,
  notify,
}: {
  media: MediaController;
  title: string;
  onModeChange: (mode: 'player' | 'editor') => void;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [quality, setQuality] = useState(2);
  const [phase, setPhase] = useState<'settings' | 'authorizing' | 'ready' | 'recording'>(
    'settings',
  );
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const preset = EXPORT_PRESETS[quality];
  const size = exportSize(preset.width, innerWidth / innerHeight);
  const releaseCapture = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    (navigator.mediaDevices as CaptureDevices)?.setCaptureHandleConfig?.({});
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      releaseCapture();
    };
  }, []);

  const chooseTab = async () => {
    setError('');
    if (document.fullscreenElement) {
      setError('请先退出页面内的全屏，再用 F11 全屏后导出。');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || !mp4RecordingType()) {
      setError('当前浏览器不支持 MP4 录制，请使用新版 Chrome 或 Edge。');
      return;
    }
    setPhase('authorizing');
    try {
      const devices = navigator.mediaDevices as CaptureDevices;
      const handle = crypto.randomUUID();
      devices.setCaptureHandleConfig?.({ handle, permittedOrigins: [location.origin] });
      const captured = await devices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { ideal: size.width },
          height: { ideal: size.height },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: { suppressLocalAudioPlayback: false },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'exclude',
        systemAudio: 'exclude',
      } as DisplayMediaStreamOptions);
      stream.current = captured;
      if (!mounted.current) {
        releaseCapture();
        return;
      }
      const track = captured.getVideoTracks()[0] as CaptureTrack;
      if (
        track.getSettings().displaySurface !== 'browser' ||
        (devices.setCaptureHandleConfig && track.getCaptureHandle?.()?.handle !== handle)
      ) {
        throw new Error('请选择这个 Waifu Fit Player 标签页。');
      }
      if (!captured.getAudioTracks().length) {
        throw new Error('没有捕获到声音，请重新选择当前标签页并勾选「分享标签页音频」。');
      }
      captured.getTracks().forEach((item) =>
        item.addEventListener(
          'ended',
          () => {
            if (controller.current) controller.current.abort();
            else if (mounted.current) {
              releaseCapture();
              setPhase('settings');
              setError('已停止分享，可以重新选择标签页。');
            }
          },
          { once: true },
        ),
      );
      setPhase('ready');
    } catch (reason) {
      releaseCapture();
      if (!mounted.current) return;
      setPhase('settings');
      if (!(
        reason instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(reason.name)
      ))
        setError(reason instanceof Error ? reason.message : '无法开始录制。');
    }
  };

  const start = async () => {
    const captured = stream.current;
    const video = media.element;
    const mimeType = mp4RecordingType();
    if (!captured || !video || !mimeType || controller.current) return;
    if (!media.getStatus().volume) {
      setError('当前视频已静音，请取消导出、开启声音后再试。');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    const previous = { time: media.getTime(), rate: media.getStatus().rate };
    let completed = false;
    const cancel = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') abort.abort();
    };
    const hidden = () => {
      if (document.hidden) abort.abort();
    };
    try {
      setError('');
      media.pause();
      // Switching to the existing game view also unmounts the editor's loop controls.
      flushSync(() => {
        onModeChange('player');
        setPhase('recording');
      });
      // Keep the F11 viewport. DOM fullscreen during tab capture lets Chrome
      // resize the page to its capture-preferred size, changing the composition.
      abort.signal.throwIfAborted();
      document.addEventListener('keydown', cancel, true);
      document.addEventListener('visibilitychange', hidden);
      media.setLoopRange(null);
      media.setRate(1);
      media.seek(0);
      await prepareVideoFrame(video, abort.signal);
      await waitForCaptureLayout(abort.signal);
      const target = exportSize(preset.width, innerWidth / innerHeight);
      const track = captured.getVideoTracks()[0];
      await track.applyConstraints({
        width: { exact: target.width },
        height: { exact: target.height },
        frameRate: { ideal: 60, max: 60 },
      });
      // Allow the game view to replace the settings dialog in the capture stream.
      await new Promise((resolve) => setTimeout(resolve, 200));
      abort.signal.throwIfAborted();
      const actual = track.getSettings();
      if (actual.frameRate !== undefined && actual.frameRate < 59) {
        throw new Error('浏览器未提供 60 fps 录制，请尝试较低画质后重新导出。');
      }
      const blob = await recordVideo(captured, video, mimeType, preset.bitrate, abort.signal);
      abort.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[<>:"/\\|?*]/g, '_')}_${actual.width}x${actual.height}_60fps.mp4`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      completed = true;
    } catch (reason) {
      if (mounted.current) {
        setError(
          reason instanceof DOMException && reason.name === 'AbortError'
            ? '录制已取消，未保存不完整视频。'
            : reason instanceof Error
              ? reason.message
              : '导出失败，请重试。',
        );
      }
    } finally {
      document.removeEventListener('keydown', cancel, true);
      document.removeEventListener('visibilitychange', hidden);
      releaseCapture();
      media.pause();
      media.setRate(previous.rate);
      media.seek(previous.time);
      controller.current = null;
      if (mounted.current) {
        onModeChange('editor');
        setPhase('settings');
        if (completed) {
          onClose();
          notify('整曲 MP4 已导出。');
        }
      }
    }
  };

  if (phase === 'recording') return null;
  return (
    <ModalBackdrop onClose={onClose}>
      <section
        className="modal video-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-export-title"
      >
        <span className="eyebrow">FULL SONG / MP4</span>
        <h2 id="video-export-title">导出跟练视频</h2>
        <div className="export-quality" role="group" aria-label="导出画质">
          {EXPORT_PRESETS.map((item, index) => (
            <button
              key={item.label}
              className="button light"
              aria-pressed={quality === index}
              disabled={phase === 'authorizing'}
              onClick={() => setQuality(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p>
          {size.width} × {size.height} · 60 fps · 保留当前画面比例
        </p>
        <p>
          请先按 F11
          全屏，再选择当前标签页并勾选「分享标签页音频」。开始导出后会播放并录制整首歌，结束后自动下载。录制期间保持此页面在前台，按
          Esc 可取消。
        </p>
        {error && (
          <p className="export-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button light" onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={phase === 'authorizing'}
            onClick={() => void (phase === 'ready' ? start() : chooseTab())}
          >
            {phase === 'ready'
              ? '开始导出'
              : phase === 'authorizing'
                ? '等待选择标签页…'
                : '选择录制标签页'}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
