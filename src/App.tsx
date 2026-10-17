import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  Check,
  Download,
  Film,
  FolderOpen,
  Heart,
  HelpCircle,
  Plus,
  Save,
  X,
} from 'lucide-react';
import { blankChart, parseChart, serializeChart, type Chart } from './model';
import { historyReducer } from './editing';
import { MediaController, useMediaStatus } from './media';
import { usePlayerPreparation } from './usePlayerPreparation';
import { isTyping } from './recording';
import { demoChart } from './demo';
import { Player } from './views/Player';
import { Editor } from './views/Editor';
import { Home } from './views/Home';
import { Transport } from './components/Transport';
import {
  PracticeBackdrop,
  PracticeCover,
  PracticeForeground,
  PracticeMasthead,
} from './components/PracticeArtwork';
import { ModalBackdrop } from './components/ModalBackdrop';
import {
  demoVideo,
  prepareVideo,
  readStoredVideo,
  releaseVideo,
  rememberVideo,
  resolveVideo,
  videoPicker,
  type PreparedVideo,
  type StoredVideo,
  type VideoAsset,
  type VideoFileHandle,
} from './local-media';

type SaveHandle = {
  createWritable: () => Promise<{
    write: (text: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
type SaveWindow = Window & { showSaveFilePicker?: (options: unknown) => Promise<SaveHandle> };
const DRAFT_KEY = 'waifu-fit-player-draft-v1';
const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '');
type VideoRequest = {
  kind: 'new' | 'open' | 'replace';
  chart: Chart;
  isSaved: boolean;
  reason?: string;
  permission?: StoredVideo;
};

export default function App() {
  const [initial] = useState(() => blankChart());
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial,
    future: [],
  });
  const chart = history.present;
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(chart) !== saved;
  const [media] = useState(() => new MediaController());
  const status = useMediaStatus(media);
  const [source, setSource] = useState('');
  const preparation = usePlayerPreparation(media, source, chart);
  const objectUrl = useRef<string | null>(null),
    fileHandle = useRef<SaveHandle | null>(null);
  const activeVideo = useRef<PreparedVideo | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [binding, setBinding] = useState<VideoRequest | null>(null);
  const [busy, setBusy] = useState('');
  const working = useRef(false);
  const [mode, setMode] = useState<'home' | 'player' | 'editor'>('home');
  const [notice, setNotice] = useState(''),
    [help, setHelp] = useState(false),
    [demo, setDemo] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null),
    [saving, setSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(() => {
    try {
      return !!localStorage.getItem(DRAFT_KEY);
    } catch {
      return false;
    }
  });
  const chartInput = useRef<HTMLInputElement>(null),
    videoInput = useRef<HTMLInputElement>(null),
    albumRef = useRef<HTMLDivElement>(null);
  const videoIntent = useRef<VideoRequest | null>(null);
  const notify = useCallback((text: string) => setNotice(text), []);
  useEffect(() => {
    if (mode === 'player') setNotice('');
  }, [mode]);
  const edit = useCallback((next: Chart) => dispatch({ type: 'edit', chart: next }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []),
    redo = useCallback(() => dispatch({ type: 'redo' }), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, serializeChart(chart));
        setHasDraft(true);
      } catch {
        /* Export remains available if browser storage is full. */
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [chart, dirty]);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  const reset = (next: Chart, isSaved = true) => {
    dispatch({ type: 'reset', chart: next });
    setSaved(isSaved ? JSON.stringify(next) : '');
    fileHandle.current = null;
  };
  const guard = (action: () => void) => {
    if (working.current) return;
    media.pause();
    if (dirty) setPending(() => action);
    else action();
  };
  const runTask = async (message: string, action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(message);
    try {
      await action();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        notify(`未能完成：${error instanceof Error ? error.message : '无法读取作品。'}`);
    } finally {
      working.current = false;
      setBusy('');
    }
  };
  const installProject = async (
    next: Chart,
    asset: VideoAsset,
    isSaved: boolean,
    persist = false,
    isDemo = false,
  ) => {
    const video = await prepareVideo(asset);
    let paired: Chart;
    try {
      paired = parseChart({ ...next, videoHint: video.hint }, video.hint.durationMs);
      if (persist) await rememberVideo(asset);
    } catch (error) {
      releaseVideo(video);
      throw error;
    }
    // Commit the chart and its validated video together. Never clear the current project early.
    media.pause();
    media.seek(0);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = video.ownedUrl ? video.src : null;
    activeVideo.current = video;
    setSource(video.src);
    setProjectRevision((revision) => revision + 1);
    reset(paired, isDemo || (isSaved && JSON.stringify(paired) === JSON.stringify(next)));
    setDemo(isDemo);
    setMode(isDemo ? 'player' : 'editor');
    setBinding(null);
  };
  const openProject = async (next: Chart, isSaved: boolean) => {
    const result = await resolveVideo(next.videoHint.assetId);
    if ('asset' in result) {
      try {
        await installProject(next, result.asset, isSaved);
        notify(isSaved ? '作品已打开，关联视频已自动载入。' : '草稿与关联视频已恢复。');
      } catch (error) {
        setBinding({
          kind: 'open',
          chart: next,
          isSaved,
          reason: `关联视频无法用于此作品，请重新定位。${error instanceof Error ? error.message : ''}`,
        });
      }
    } else setBinding({ kind: 'open', chart: next, isSaved, ...result });
  };
  const acceptVideo = async (request: VideoRequest, file: File, handle?: VideoFileHandle) => {
    const next = request.kind === 'new' ? blankChart(fileTitle(file.name)) : request.chart;
    await installProject(
      next,
      { id: crypto.randomUUID(), kind: 'file', file, handle },
      false,
      true,
    );
    notify(
      request.kind === 'new' ? '作品已创建，视频关联已记住。' : '视频关联已更新，请保存作品。',
    );
  };
  const chooseVideo = (request: VideoRequest) => {
    videoIntent.current = request;
    const picker = videoPicker();
    if (!picker) {
      videoInput.current?.click();
      return;
    }
    // Invoke the picker directly in the click gesture, before any asynchronous storage work.
    void picker()
      .then(([handle]) => {
        if (handle)
          return runTask('正在读取并关联视频…', async () => {
            await acceptVideo(request, await handle.getFile(), handle);
          });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Saving another project may consume the browser's file-picker activation.
        setBinding({ ...request, reason: '请选择视频以完成作品。' });
        notify(error instanceof Error ? error.message : '无法打开视频选择器。');
      });
  };
  const newChart = () =>
    guard(() => chooseVideo({ kind: 'new', chart: blankChart(), isSaved: false }));
  const openChart = () => guard(() => chartInput.current?.click());
  const openVideo = () => {
    if (working.current) return;
    media.pause();
    chooseVideo({ kind: 'replace', chart, isSaved: false });
  };
  const loadDemo = () =>
    runTask('正在打开示例作品…', async () => {
      const asset = await demoVideo();
      if (asset.kind === 'demo')
        await installProject(demoChart(asset.fileName), asset, true, false, true);
    });
  const importChart = (file: File) =>
    runTask('正在打开作品和关联视频…', async () => {
      const next = parseChart(JSON.parse(await file.text()));
      await openProject(next, true);
    });
  const authorizeVideo = (request: VideoRequest) =>
    runTask('正在恢复视频访问…', async () => {
      const record = request.permission;
      if (!record?.handle?.requestPermission) return;
      // This must run in the button gesture, rather than automatically during JSON loading.
      if ((await record.handle.requestPermission({ mode: 'read' })) !== 'granted') {
        setBinding({ ...request, reason: '尚未允许读取。可以再次授权，或重新选择视频。' });
        return;
      }
      const result = await readStoredVideo(record);
      if ('asset' in result) await installProject(request.chart, result.asset, request.isSaved);
      else setBinding({ ...request, permission: undefined, ...result });
    });
  const save = async (exportCopy = false): Promise<boolean> => {
    if (!activeVideo.current || !status.ready || working.current) {
      notify('请先完成作品的视频关联并等待视频载入。');
      return false;
    }
    working.current = true;
    setSaving(true);
    try {
      const next = {
        ...chart,
        videoHint: activeVideo.current.hint,
      };
      const text = serializeChart(next, status.durationMs || undefined);
      const name = `${next.title.replace(/[<>:"/\\|?*]/g, '_')}.wfp.json`;
      const picker = (window as SaveWindow).showSaveFilePicker;
      if (!exportCopy && picker) {
        const handle =
          fileHandle.current ||
          (await picker.call(window, {
            suggestedName: name,
            types: [
              { description: 'Waifu Fit Player 作品', accept: { 'application/json': ['.json'] } },
            ],
          }));
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        fileHandle.current = handle;
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (JSON.stringify(next) !== JSON.stringify(chart)) edit(next);
      setSaved(JSON.stringify(next));
      notify(
        exportCopy || !picker
          ? '作品已导出，下次打开会自动载入关联视频。'
          : '作品已保存，已记住关联视频。',
      );
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        notify(`保存失败：${error instanceof Error ? error.message : '无法写入文件。'}`);
      return false;
    } finally {
      working.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (pending || help || binding || busy || preparation.pending) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mode === 'editor' && mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(e.shiftKey);
        return;
      }
      if (isTyping(e.target)) return;
      if (mode === 'editor' && mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mode === 'editor' && mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.code === 'Space' && mode !== 'home') {
        e.preventDefault();
        if (!e.repeat) media.toggle().catch(() => notify('Press Play to start.'));
      }
    };
    const keyup = (e: KeyboardEvent) => {
      // Space is a transport command, including when a checkbox or button has focus.
      if (
        !pending &&
        !help &&
        !binding &&
        !busy &&
        mode !== 'home' &&
        e.code === 'Space' &&
        !isTyping(e.target)
      )
        e.preventDefault();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyup);
    };
  });
  const recover = () =>
    guard(
      () =>
        void runTask('正在恢复作品草稿…', async () => {
          const next = parseChart(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'));
          await openProject(next, false);
        }),
    );
  const fullScreen = () => {
    if (document.fullscreenElement)
      document.exitFullscreen().catch(() => notify('Unable to exit fullscreen.'));
    else
      albumRef.current?.requestFullscreen().catch(() => notify('Fullscreen unavailable. Try F11.'));
  };

  return (
    <div className={`app ${mode === 'player' ? 'practice-app' : ''}`}>
      <div className="ambient-shape pink" />
      <div className="ambient-shape cyan" />
      <div className="ambient-dots" />
      <header className="app-header" hidden={mode === 'player'}>
        <button
          className="wordmark"
          onClick={() => {
            media.pause();
            setMode('home');
          }}
          aria-label="返回主页"
        >
          <span className="brand-icon">▶</span>
          <span>
            WAIFU<span className="brand-fit">FIT</span>
            <small>PLAYER / MOVE WITH MUSIC</small>
          </span>
        </button>
        <nav aria-label="主导航">
          <button
            className={mode === 'home' ? 'active' : ''}
            onClick={() => {
              media.pause();
              setMode('home');
            }}
          >
            工作台
          </button>
          <button
            className={mode === 'player' ? 'active' : ''}
            disabled={!source}
            onClick={() => setMode('player')}
          >
            跟练模式
          </button>
          <button
            className={mode === 'editor' ? 'active' : ''}
            disabled={!source}
            onClick={() => setMode('editor')}
          >
            谱面编辑
          </button>
        </nav>
        <div className="header-right">
          <span className="local-badge">
            <i />
            LOCAL ONLY
          </span>
          <button
            className="icon-button"
            title="操作帮助"
            aria-label="操作帮助"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>
      <main>
        <div hidden={mode !== 'home'}>
          <Home
            chart={chart}
            hasMedia={!!source}
            hasDraft={hasDraft}
            onDemo={() => guard(() => void loadDemo())}
            onNew={newChart}
            onOpen={openChart}
            onResume={() => setMode('player')}
            onRecover={recover}
          />
        </div>
        <div
          className={`album-workspace ${mode === 'editor' ? 'editing' : 'practice'}`}
          hidden={mode === 'home'}
          ref={albumRef}
        >
          {mode === 'player' && <PracticeBackdrop />}
          <div className="album-spine" hidden={mode === 'player'}>
            <span>WFP / PERSONAL RHYTHM COLLECTION</span>
            <i />
            VOL. 01
          </div>
          <div className="workspace-header" hidden={mode === 'player'}>
            <div className="workspace-title">
              <span className="eyebrow" hidden={mode === 'player'}>
                {mode === 'editor' ? 'MAKE YOUR OWN RHYTHM' : 'NOW PLAYING'}
              </span>
              <h1>
                {chart.title}
                <span
                  className={`save-dot ${dirty ? 'dirty' : ''}`}
                  aria-hidden="true"
                  hidden={mode === 'player'}
                  title={dirty ? '有未保存的修改' : '已保存'}
                />
              </h1>
              <p hidden={mode === 'player'}>
                {demo
                  ? '功能演示谱 · 150 BPM · 尚未逐拍校准编舞'
                  : `${chart.tempoSegments[0]?.bpm ?? 120} BPM · ${chart.notes.length} 个动作提示 · ${dirty ? '未保存修改' : '谱面已保存'}`}
              </p>
            </div>
            <div className="workspace-actions" hidden={mode !== 'editor'}>
              <button className="button small ghost" onClick={newChart}>
                <Plus size={15} />
                新建
              </button>
              <button className="button small ghost" onClick={openChart}>
                <FolderOpen size={15} />
                打开作品
              </button>
              <button className="button small ghost" onClick={openVideo}>
                <Film size={15} />
                {source ? '更换视频' : '选择视频'}
              </button>
              <button
                className="button small dark"
                onClick={() => void save()}
                disabled={saving || !status.ready}
              >
                <Save size={15} />
                保存
              </button>
              <button
                className="icon-button export-button"
                title="导出 JSON 副本（Ctrl+Shift+S）"
                aria-label="导出 JSON"
                disabled={saving || !status.ready}
                onClick={() => void save(true)}
              >
                <Download size={17} />
              </button>
            </div>
          </div>
          <div className="stage-grid">
            <div className="stage-left">
              {mode === 'player' && <PracticeCover chart={chart} media={media} />}
              {mode !== 'home' && (
                <Player chart={chart} media={media} showGuide={mode === 'editor'} />
              )}
            </div>
            <div className="stage-right">
              {mode === 'player' && (
                <PracticeMasthead
                  onReturn={async () => {
                    media.pause();
                    if (document.fullscreenElement) {
                      await document
                        .exitFullscreen()
                        .catch(() => notify('Unable to exit fullscreen.'));
                    }
                    setMode('editor');
                  }}
                />
              )}
              <section className="video-panel" aria-label="Video">
                <div className="video-topline" hidden={mode === 'player'}>
                  <span>
                    <i />
                    {mode === 'editor' ? 'VIDEO PREVIEW' : 'YOUR PRIVATE STAGE'}
                  </span>
                  <span>↗</span>
                </div>
                <div className="video-viewport">
                  <video
                    ref={media.attach}
                    src={source || undefined}
                    preload="auto"
                    playsInline
                    onDoubleClick={() => media.toggle().catch(() => {})}
                  />
                  {!source && (
                    <div className="video-placeholder">
                      <div className="placeholder-icon">
                        <Film size={32} />
                      </div>
                      <strong>让喜欢的角色，陪你动起来。</strong>
                      <p>选择一个本地 MP4 视频，开始这一首。</p>
                      <button className="button primary small" onClick={openVideo}>
                        <Plus size={15} />
                        选择视频
                      </button>
                    </div>
                  )}
                  {status.error && (
                    <div className="video-error">
                      {status.error}
                      <button onClick={openVideo}>
                        {mode === 'player' ? 'Select video' : '重新选择视频'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="video-caption" hidden={mode === 'player'}>
                  <span>
                    <Heart size={12} /> MOVE WITH YOUR FAVORITE
                  </span>
                  <span>VIDEO + MUSIC</span>
                </div>
                {mode === 'player' && (
                  <Transport media={media} fullScreen={fullScreen} notify={notify} />
                )}
              </section>
            </div>
            {mode === 'player' && <div className="album-hinge" aria-hidden="true" />}
          </div>
          {mode === 'player' && <PracticeForeground />}
          {mode !== 'player' && <Transport media={media} fullScreen={fullScreen} notify={notify} />}
          {mode === 'editor' && (
            <Editor
              key={projectRevision}
              chart={chart}
              media={media}
              onChange={edit}
              onUndo={undo}
              onRedo={redo}
              canUndo={!!history.past.length}
              canRedo={!!history.future.length}
              notify={notify}
            />
          )}
          <div className="workspace-bottom" hidden={mode !== 'editor'}>
            <span>EDITOR / 空格 播放暂停 · Ctrl+S 保存</span>
            <button onClick={() => setMode('player')}>
              进入跟练
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </main>
      {mode !== 'home' &&
        preparation.pending &&
        createPortal(
          <div className="playback-preparation" aria-busy={!preparation.error}>
            {preparation.error ? (
              <div className="preparation-error" role="alert">
                <p>{preparation.error}</p>
                <button className="button primary small" onClick={preparation.retry}>
                  重试
                </button>
                <button className="button light small" onClick={() => setMode('home')}>
                  返回
                </button>
              </div>
            ) : (
              <div
                className="preparation-track"
                role="progressbar"
                aria-label="准备播放资源"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(preparation.progress * 100)}
              >
                <span style={{ transform: `scaleX(${preparation.progress})` }} />
              </div>
            )}
          </div>,
          document.fullscreenElement || document.body,
        )}
      <input
        hidden
        ref={chartInput}
        type="file"
        accept=".json,application/json"
        aria-label="导入谱面文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importChart(file);
          e.currentTarget.value = '';
        }}
      />
      <input
        hidden
        ref={videoInput}
        type="file"
        accept=".mp4,video/mp4"
        aria-label="导入视频文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const request = videoIntent.current;
          if (file && request)
            void runTask('正在读取并关联视频…', () => acceptVideo(request, file));
          e.currentTarget.value = '';
        }}
      />
      {notice &&
        createPortal(
          <div className="toast" role="status">
            <span>{notice}</span>
            <button aria-label="关闭提示" onClick={() => setNotice('')}>
              <X size={17} />
            </button>
          </div>,
          document.fullscreenElement || document.body,
        )}
      {busy ? (
        <ModalBackdrop key="loading" onClose={() => {}}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="loading-title"
          >
            <h2 id="loading-title">{busy}</h2>
            <p>视频和谱面准备完成后，将一起打开。</p>
          </section>
        </ModalBackdrop>
      ) : (
        binding && (
          <ModalBackdrop key="binding" onClose={() => setBinding(null)}>
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="video-binding-title"
            >
              <span className="eyebrow">{binding.chart.title}</span>
              <h2 id="video-binding-title">
                {binding.permission ? '允许读取关联视频' : '定位作品的视频'}
              </h2>
              <p>{binding.reason}</p>
              {binding.chart.videoHint.fileName && (
                <p className="linked-video-name">{binding.chart.videoHint.fileName}</p>
              )}
              <div className="modal-actions">
                <button className="button light" onClick={() => setBinding(null)}>
                  取消打开
                </button>
                <button
                  className={`button ${binding.permission ? 'light' : 'primary'}`}
                  onClick={() => chooseVideo(binding)}
                >
                  <Film size={16} />
                  选择对应视频
                </button>
                {binding.permission && (
                  <button className="button primary" onClick={() => void authorizeVideo(binding)}>
                    允许读取视频
                  </button>
                )}
              </div>
            </section>
          </ModalBackdrop>
        )
      )}
      {pending && (
        <ModalBackdrop onClose={() => setPending(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <span className="eyebrow">SAVE YOUR RHYTHM</span>
            <h2 id="unsaved-title">先保留刚才的灵感？</h2>
            <p>当前谱面有未保存的修改。可以先保存，也可以不保存并继续操作。</p>
            <div className="modal-actions">
              <button className="button light" onClick={() => setPending(null)}>
                取消
              </button>
              <button
                className="button light"
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  action();
                }}
              >
                不保存并继续
              </button>
              <button
                className="button primary"
                disabled={saving}
                onClick={async () => {
                  if (await save()) {
                    const action = pending;
                    setPending(null);
                    action();
                  }
                }}
              >
                保存并继续
              </button>
            </div>
          </section>
        </ModalBackdrop>
      )}
      {help && (
        <ModalBackdrop onClose={() => setHelp(false)}>
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭帮助"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <span className="eyebrow">QUICK START</span>
            <h2 id="help-title">从第一拍开始。</h2>
            <ol>
              <li>
                <strong>打开视频</strong>
                <p>新建作品时选择 MP4，自动建立谱面与视频的关联。音乐使用视频本身的声音。</p>
              </li>
              <li>
                <strong>对齐节拍</strong>
                <p>
                  “节拍段”中填写 BPM，定位视频后设为第一拍。变拍处新增段；修改网格不会移动已有动作。
                </p>
              </li>
              <li>
                <strong>写下动作</strong>
                <p>
                  点击时间轴放置，拖动空白处创建 HOLD。选中单个普通音符后，可拖动右侧手柄直接拉长。
                  绘制类型可直接选 TAP / HOLD / SWAY；选中音符后，也能在右侧“类型”中转换。
                  选择工具支持框选，长条两端可以拉伸。可拖往支持相应方向的轨道；选中后按 F
                  或“反向”翻转方向，ARMS 拳套用 F 互换 L/R。
                </p>
              </li>
              <li>
                <strong>边播边录</strong>
                <p>
                  启用按键录谱，1～5 选轨。方向键点按写入 TAP，长按写入 HOLD，Ctrl + 长按写入
                  SWAY。松开结束；暂停或跳转取消未完成的录入。跟随默认锁定，解锁后可关闭。
                </p>
              </li>
              <li>
                <strong>ARMS 手臂</strong>
                <p>
                  八方向箭头表示动作方位，L/R 拳套表示对应手向前出拳。TAP、HOLD、SWAY 共通。
                  箭头用手颜色：ANY 未指定白色，L 左手蓝色，R 右手红色，BOTH 双手紫色；H
                  循环换手，支持多选。 录谱使用方向键；Shift + ←/→ 录 ↖/↗，Alt + ←/→ 录
                  ↙/↘，也支持数字小键盘八方向。 J/K 录左右拳套。长按 HOLD，Ctrl + 长按 SWAY；录谱时
                  H 修改后续箭头的用手。
                </p>
              </li>
              <li>
                <strong>STEP 踏步</strong>
                <p>
                  ← / → 录入左右踏步，点按 TAP、长按 HOLD、Ctrl + 长按 SWAY。 ↓ 直接录入 FREE
                  SWAY，长按决定时长。Shift + 左右跨两格；Alt + ← / → 录入 FOLLOW，并步跟脚只支持
                  TAP。类型菜单仅提供 TAP、FOLLOW、HOLD、SWAY、FREE SWAY；箭头单独选择移动方向。
                  用脚颜色独立设置：L 左脚蓝色、R 右脚红色，H 切换，支持多选和所有类型。 F
                  只反转方向，普通左右踏步按 D 切换跨度。
                </p>
              </li>
              <li>
                <strong>保存，然后跟练</strong>
                <p>
                  Ctrl+S 保存 JSON，Ctrl+Shift+S 导出作品副本。下次打开 JSON
                  会自动载入关联视频；仅在视频丢失或权限失效时需要重新定位或授权。
                </p>
              </li>
            </ol>
            <div className="help-note">
              SPECIAL：在“曲目”中定义一种招牌动作，在细标记行重复放置。
              <br />
              左右方向以你的身体为准；长条尾部到框即结束保持。
            </div>
            <button className="button primary" onClick={() => setHelp(false)}>
              <Check size={17} />
              开始吧
            </button>
          </section>
        </ModalBackdrop>
      )}
    </div>
  );
}
