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
  Moon,
  Plus,
  Save,
  Settings,
  LibraryBig,
  Send,
  Sun,
  X,
} from 'lucide-react';
import { blankChart, parseChart, serializeChart, type Chart } from './model';
import { historyReducer } from './editing';
import { MediaController, audioOutputErrorMessage, useMediaStatus } from './media';
import { usePlayerPreparation } from './usePlayerPreparation';
import { isTyping } from './recording';
import { DEFAULT_NOTE_SPEED } from './timing';
import { useLibrary } from './useLibrary';
import {
  latestEdition,
  publishSong,
  readLibrary,
  unpublishSong,
  videoIds,
  type Difficulty,
  type Edition,
  type Song,
} from './library';
import { coverFromVideo } from './cover';
import { LibraryMenu } from './views/LibraryMenu';
import {
  AlbumManager,
  PublicationFields,
  PublishDialog,
  SongManager,
} from './components/LibraryControls';
import { MenuMusicSettings } from './components/MenuMusic';
import { useMenuMusic } from './useMenuMusic';
import { Player } from './views/Player';
import { Editor } from './views/Editor';
import { Home } from './views/Home';
import { Transport } from './components/Transport';
import { PracticeBackdrop, PracticeCover, PracticeMasthead } from './components/PracticeArtwork';
import { ModalBackdrop } from './components/ModalBackdrop';
import { GameStartCountdown } from './components/GameStartCountdown';
import {
  forgetVideo,
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

type OpenContext = { play?: boolean; edition?: Edition; legacy?: boolean };
const LAST_DRAFT_KEY = 'waifu-last-draft';
const DRAFT_KEY = 'waifu-fit-player-draft-v1';
const WORKBENCH_THEME_KEY = 'waifu-fit-player-workbench-theme';
const NOTE_SPEED_KEY = 'waifu-fit-player-note-speed';
const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '');
type VideoRequest = {
  kind: 'new' | 'open' | 'replace';
  chart: Chart;
  isSaved: boolean;
  reason?: string;
  permission?: StoredVideo;
  context?: OpenContext;
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
  const objectUrl = useRef<string | null>(null);
  const activeVideo = useRef<PreparedVideo | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [binding, setBinding] = useState<VideoRequest | null>(null);
  const [busy, setBusy] = useState('');
  const working = useRef(false);
  const [mode, setMode] = useState<'home' | 'albums' | 'songs' | 'player' | 'editor'>('home');
  const [settings, setSettings] = useState(false);
  const [noteSpeed, setNoteSpeed] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(NOTE_SPEED_KEY));
      return stored >= 0.5 && stored <= 10 ? stored : DEFAULT_NOTE_SPEED;
    } catch {
      return DEFAULT_NOTE_SPEED;
    }
  });
  const changeNoteSpeed = (value: number) => {
    setNoteSpeed(value);
    try {
      localStorage.setItem(NOTE_SPEED_KEY, String(value));
    } catch {
      // Keep the preference for this session if local storage is unavailable.
    }
  };
  const [workbenchDark, setWorkbenchDark] = useState(() => {
    try {
      return localStorage.getItem(WORKBENCH_THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });
  const toggleWorkbenchTheme = () => {
    const next = !workbenchDark;
    setWorkbenchDark(next);
    try {
      localStorage.setItem(WORKBENCH_THEME_KEY, next ? 'dark' : 'light');
    } catch {
      // The current session can still switch themes when storage is unavailable.
    }
  };
  const [notice, setNotice] = useState(''),
    [help, setHelp] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null),
    [saving, setSaving] = useState(false);
  const chartInput = useRef<HTMLInputElement>(null),
    videoInput = useRef<HTMLInputElement>(null);
  const videoIntent = useRef<VideoRequest | null>(null);
  const notify = useCallback((text: string) => setNotice(text), []);
  const library = useLibrary(notify);
  const { updateSong } = library;
  const [draftMeta, setDraftMeta] = useState({ albumId: '', cover: '' });
  const [playOrigin, setPlayOrigin] = useState<'editor' | 'library'>('editor');
  const [albumId, setAlbumId] = useState('all');
  const [selectedSong, setSelectedSong] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('hard');
  const [coverSeed] = useState(Math.random);
  const [manageSongs, setManageSongs] = useState(false);
  const [manageAlbums, setManageAlbums] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const deletedSongs = useRef(new Set<string>());
  const [startPending, setStartPending] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<string>();
  const menuMusic = useMenuMusic(
    mode === 'home' || mode === 'albums' ? 'theme' : mode === 'songs' ? 'preview' : null,
    previewAsset,
    notify,
  );
  const difficulty = chart.difficulty ?? 'hard';
  const persistDraft = useCallback(async () => {
    if (!source || !chart.songId || deletedSongs.current.has(chart.songId)) return;
    const edition: Edition = { chart: structuredClone(chart), ...draftMeta, updatedAt: Date.now() };
    const result = await updateSong(chart.songId, (previous) =>
      deletedSongs.current.has(chart.songId!)
        ? previous
        : {
            id: chart.songId!,
            drafts: { ...previous?.drafts, [chart.difficulty ?? 'hard']: edition },
            released: previous?.released ?? {},
          },
    );
    setSaved(JSON.stringify(chart));
    try {
      localStorage.setItem(
        LAST_DRAFT_KEY,
        JSON.stringify({ id: chart.songId, difficulty: chart.difficulty ?? 'hard' }),
      );
    } catch {
      /* The draft itself is in IndexedDB. */
    }
    return result;
  }, [chart, draftMeta, source, updateSong]);
  useEffect(() => {
    if (mode === 'player') setNotice('');
  }, [mode]);
  const completeCountdown = useCallback(() => {
    setStartPending(false);
    void media.toggle().catch(() => notify('请点击播放开始。'));
  }, [media, notify]);
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
    if (mode !== 'editor' || !source || !chart.songId) return;
    const timer = setTimeout(() => {
      void persistDraft().catch((error) => notify(`草稿未能保存：${error.message}`));
    }, 650);
    return () => clearTimeout(timer);
  }, [mode, source, chart, draftMeta, persistDraft, notify]);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  const reset = (next: Chart, isSaved = true) => {
    dispatch({ type: 'reset', chart: next });
    setSaved(isSaved ? JSON.stringify(next) : '');
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
    context?: OpenContext,
  ) => {
    const video = await prepareVideo(asset);
    let paired: Chart;
    try {
      const existing = library.songs.find((song) =>
        next.songId
          ? song.id === next.songId
          : latestEdition(song).chart.title === next.title &&
            latestEdition(song).chart.videoHint.fileName === next.videoHint.fileName,
      );
      paired = parseChart(
        {
          ...next,
          songId: next.songId ?? existing?.id ?? crypto.randomUUID(),
          difficulty: next.difficulty ?? 'hard',
          videoHint: video.hint,
        },
        video.hint.durationMs,
      );
      if (persist) await rememberVideo(asset);
    } catch (error) {
      releaseVideo(video);
      throw error;
    }
    const known = library.songs.find((s) => s.id === paired.songId);
    const edition = context?.edition ?? known?.drafts[paired.difficulty ?? 'hard'];
    const meta = { albumId: edition?.albumId ?? '', cover: edition?.cover ?? '' };
    try {
      if (!context?.play)
        await updateSong(paired.songId!, (previous) => ({
          id: paired.songId!,
          drafts: {
            ...previous?.drafts,
            [paired.difficulty ?? 'hard']: { chart: paired, ...meta, updatedAt: Date.now() },
          },
          released: previous?.released ?? {},
        }));
      else if (JSON.stringify(next.videoHint) !== JSON.stringify(paired.videoHint))
        await updateSong(paired.songId!, (previous) => {
          if (!previous) return previous;
          const d = paired.difficulty ?? 'hard';
          return {
            ...previous,
            released: { ...previous.released, [d]: { ...previous.released[d]!, chart: paired } },
          };
        });
    } catch (error) {
      releaseVideo(video);
      throw error;
    }
    deletedSongs.current.delete(paired.songId!);
    setDraftMeta(meta);
    setPlayOrigin(context?.play ? 'library' : 'editor');
    setStartPending(!!context?.play);
    if (!context?.play) {
      try {
        localStorage.setItem(
          LAST_DRAFT_KEY,
          JSON.stringify({ id: paired.songId, difficulty: paired.difficulty }),
        );
        if (context?.legacy) localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* IndexedDB remains authoritative. */
      }
    }
    // Commit the chart and its validated video together. Never clear the current project early.
    media.pause();
    media.seek(0);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = video.ownedUrl ? video.src : null;
    activeVideo.current = video;
    setSource(video.src);
    setProjectRevision((revision) => revision + 1);
    reset(paired, isSaved);
    setMode(context?.play ? 'player' : 'editor');
    setBinding(null);
  };
  const openProject = async (next: Chart, isSaved: boolean, context?: OpenContext) => {
    const result = await resolveVideo(next.videoHint.assetId);
    if ('asset' in result) {
      try {
        await installProject(next, result.asset, isSaved, false, context);
        if (!context?.play)
          notify(isSaved ? '作品已打开，关联视频已自动载入。' : '草稿与关联视频已恢复。');
      } catch (error) {
        setBinding({
          kind: 'open',
          context,
          chart: next,
          isSaved,
          reason: `关联视频无法用于此作品，请重新定位。${error instanceof Error ? error.message : ''}`,
        });
      }
    } else setBinding({ kind: 'open', chart: next, isSaved, context, ...result });
  };
  const acceptVideo = async (request: VideoRequest, file: File, handle?: VideoFileHandle) => {
    const next =
      request.kind === 'new'
        ? {
            ...blankChart(fileTitle(file.name)),
            songId: crypto.randomUUID(),
            difficulty: 'hard' as const,
          }
        : request.chart;
    await installProject(
      next,
      { id: crypto.randomUUID(), kind: 'file', file, handle },
      false,
      true,
      request.context,
    );
    if (!request.context?.play)
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
      if ('asset' in result)
        await installProject(request.chart, result.asset, request.isSaved, false, request.context);
      else setBinding({ ...request, permission: undefined, ...result });
    });
  const save = async (exportCopy = false): Promise<boolean> => {
    if (!source || !status.ready || working.current) return false;
    setSaving(true);
    try {
      await persistDraft();
      if (exportCopy) {
        const url = URL.createObjectURL(
          new Blob([serializeChart(chart, status.durationMs || undefined)], {
            type: 'application/json',
          }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `${chart.title.replace(/[<>:"/\\|?*]/g, '_')}_${difficulty}.wfp.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notify(exportCopy ? 'JSON 副本已导出，草稿也已保存。' : '草稿已保存。已发布的谱面不受影响。');
      return true;
    } catch (error) {
      notify(`保存失败：${(error as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        pending ||
        help ||
        settings ||
        binding ||
        busy ||
        preparation.pending ||
        (mode === 'player' && startPending) ||
        manageSongs ||
        manageAlbums ||
        publishing
      )
        return;
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
      } else if (e.code === 'Space' && (mode === 'editor' || mode === 'player')) {
        e.preventDefault();
        if (!e.repeat) media.toggle().catch(() => notify('Press Play to start.'));
      }
    };
    const keyup = (e: KeyboardEvent) => {
      // Space is a transport command, including when a checkbox or button has focus.
      if (
        !pending &&
        !help &&
        !settings &&
        !binding &&
        !busy &&
        (mode === 'editor' || mode === 'player') &&
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
  const leaveEditor = (action: () => void) => {
    media.pause();
    if (mode === 'editor' && source)
      void runTask('正在保存草稿…', async () => {
        await persistDraft();
        action();
      });
    else action();
  };
  const enterEditor = () => {
    media.pause();
    if (source && playOrigin === 'editor') {
      setMode('editor');
      return;
    }
    void runTask('正在打开草稿…', async () => {
      await library.load();
      const songs = await readLibrary('songs');
      let last: { id: string; difficulty: Difficulty } | undefined;
      try {
        last = JSON.parse(localStorage.getItem(LAST_DRAFT_KEY) || 'null');
      } catch {
        /* Start an empty editor. */
      }
      const song = songs.find((s) => s.id === last?.id);
      const edition = song?.drafts[last?.difficulty ?? 'hard'];
      if (edition) await openProject(edition.chart, true, { edition });
      else {
        const legacy = localStorage.getItem(DRAFT_KEY);
        if (legacy) await openProject(parseChart(JSON.parse(legacy)), true, { legacy: true });
        else {
          media.pause();
          setSource('');
          reset(blankChart());
          setDraftMeta({ albumId: '', cover: '' });
          setPlayOrigin('editor');
          setMode('editor');
        }
      }
    });
  };
  const playSong = (song: Song, d: Difficulty) => {
    const edition = song.released[d];
    if (!edition) return;
    setSelectedSong(song.id);
    setSelectedDifficulty(d);
    void runTask('正在准备曲目…', () => openProject(edition.chart, true, { play: true, edition }));
  };
  const editSong = (song: Song, d: Difficulty, published: boolean) => {
    const edition = published ? song.released[d] : song.drafts[d];
    if (!edition) return;
    if (
      published &&
      song.drafts[d] &&
      (JSON.stringify(song.drafts[d]!.chart) !== JSON.stringify(edition.chart) ||
        song.drafts[d]!.albumId !== edition.albumId ||
        song.drafts[d]!.cover !== edition.cover) &&
      !window.confirm(
        `以已发布 ${d.toUpperCase()} 替换这首歌的 ${d.toUpperCase()} 草稿？发布版本保持不变。`,
      )
    )
      return;
    setManageSongs(false);
    void runTask('正在打开谱面…', async () => {
      if (mode === 'editor') await persistDraft();
      await openProject(edition.chart, true, { edition });
    });
  };
  const withdraw = (song: Song, d: Difficulty) => {
    if (
      !window.confirm(
        `撤下《${latestEdition(song).chart.title}》的 ${d.toUpperCase()}？只从音游模式移除，保留该难度草稿。`,
      )
    )
      return;
    void runTask('正在撤下发布…', async () => {
      await updateSong(song.id, (old) => old && unpublishSong(old, d));
      notify(`${d.toUpperCase()} 已撤下，草稿保留。`);
    });
  };
  const deleteSong = (song: Song) => {
    if (
      !window.confirm(
        `彻底从 WAIFU 删除《${latestEdition(song).chart.title}》？将删除 Normal / Hard 的草稿、发布版本和曲绘。磁盘原始文件不会删除。`,
      )
    )
      return;
    void runTask('正在删除作品…', async () => {
      deletedSongs.current.add(song.id);
      try {
        await updateSong(song.id, () => undefined);
      } catch (error) {
        deletedSongs.current.delete(song.id);
        throw error;
      }
      const remaining = await readLibrary('songs');
      for (const id of videoIds(song))
        if (!remaining.some((other) => videoIds(other).includes(id))) await forgetVideo(id);
      if (chart.songId === song.id) {
        media.pause();
        setSource('');
        reset(blankChart());
        setDraftMeta({ albumId: '', cover: '' });
        activeVideo.current = null;
        if (objectUrl.current) {
          URL.revokeObjectURL(objectUrl.current);
          objectUrl.current = null;
        }
      }
      try {
        if (JSON.parse(localStorage.getItem(LAST_DRAFT_KEY) || 'null')?.id === song.id)
          localStorage.removeItem(LAST_DRAFT_KEY);
      } catch {
        /* Nothing to clear. */
      }
      notify('作品已从 WAIFU 删除，原始文件保留。');
    });
  };
  const updatePublication = async (values: {
    difficulty?: Difficulty;
    albumId?: string;
    cover?: string;
  }) => {
    if (values.difficulty && values.difficulty !== difficulty) {
      const existing = library.songs.find((s) => s.id === chart.songId)?.drafts[values.difficulty];
      if (
        existing &&
        !window.confirm(
          `将当前谱面复制为 ${values.difficulty.toUpperCase()} 草稿，替换该难度现有草稿？两个难度的发布版本都不改变。`,
        )
      )
        return;
      try {
        await persistDraft();
        edit({ ...chart, difficulty: values.difficulty });
      } catch (error) {
        notify(`草稿未能保存：${(error as Error).message}`);
        return;
      }
    }
    setDraftMeta((old) => ({
      albumId: values.albumId ?? old.albumId,
      cover: values.cover ?? old.cover,
    }));
  };
  const beginPublish = () => {
    media.pause();
    if (!library.albums.some((a) => a.id !== 'all' && a.id === draftMeta.albumId)) {
      notify('请先在“曲目 → 所属专辑”选择分类。');
      return;
    }
    if (!draftMeta.cover && media.element) {
      try {
        setDraftMeta((old) => ({ ...old, cover: coverFromVideo(media.element!) }));
      } catch (error) {
        notify((error as Error).message);
        return;
      }
    }
    setPublishing(true);
  };
  const publish = async () => {
    try {
      await persistDraft();
      await updateSong(chart.songId!, (song) => song && publishSong(song, difficulty));
      setPublishing(false);
      notify(`${difficulty.toUpperCase()} 已发布到曲库。`);
    } catch (error) {
      notify(`发布失败：${(error as Error).message}`);
    }
  };

  return (
    <div
      className={`app ${mode === 'player' ? 'practice-app' : mode === 'editor' ? '' : 'menu-app'}`}
      data-workbench-theme={mode === 'editor' && workbenchDark ? 'dark' : undefined}
    >
      <div className="ambient-shape pink" />
      <div className="ambient-shape cyan" />
      <div className="ambient-dots" />
      <header className="app-header" hidden={mode !== 'editor'}>
        <button
          className="wordmark"
          onClick={() => {
            leaveEditor(() => setMode('home'));
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
          <button onClick={() => leaveEditor(() => setMode('home'))}>主菜单</button>
          <button onClick={() => leaveEditor(() => setMode('albums'))}>音游模式</button>
          <button
            disabled={!source}
            onClick={() => {
              media.pause();
              setPlayOrigin('editor');
              leaveEditor(() => setMode('player'));
            }}
          >
            试玩谱面
          </button>
        </nav>
        <div className="header-right">
          <button
            className="icon-button"
            aria-label="全局设置"
            title="全局设置"
            onClick={() => setSettings(true)}
          >
            <Settings size={18} />
          </button>
          {mode !== 'player' && (
            <button
              className="icon-button"
              aria-label="切换日夜主题"
              aria-pressed={workbenchDark}
              title={`切换${workbenchDark ? '白天' : '黑夜'}模式（工作台 / 谱面编辑）`}
              onClick={toggleWorkbenchTheme}
            >
              {workbenchDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
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
        {mode === 'home' && (
          <Home
            music={menuMusic}
            onPlay={() => setMode('albums')}
            onCreate={enterEditor}
            onSettings={() => setSettings(true)}
          />
        )}
        {(mode === 'albums' || mode === 'songs') && (
          <LibraryMenu
            page={mode}
            albums={library.albums}
            songs={library.songs}
            albumId={albumId}
            songId={selectedSong}
            difficulty={selectedDifficulty}
            seed={coverSeed}
            onAlbum={(id, enter) => {
              setAlbumId(id);
              if (enter) setMode('songs');
            }}
            onSong={setSelectedSong}
            onDifficulty={setSelectedDifficulty}
            onBack={() => setMode(mode === 'songs' ? 'albums' : 'home')}
            onSettings={() => setSettings(true)}
            onCreate={enterEditor}
            onPlay={playSong}
            onPreview={setPreviewAsset}
            onEdit={(song, d) => editSong(song, d, true)}
            onManage={() => setManageSongs(true)}
          />
        )}
        <div
          className={`album-workspace ${mode === 'editor' ? 'editing' : 'practice'}`}
          hidden={mode !== 'editor' && mode !== 'player'}
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
                {`${difficulty.toUpperCase()} DRAFT · ${chart.tempoSegments[0]?.bpm ?? 120} BPM · ${chart.notes.length} 个动作提示 · ${dirty ? '正在保存草稿…' : '草稿已保存'}`}
              </p>
            </div>
            <div className="workspace-actions" hidden={mode !== 'editor'}>
              <button
                className="button small ghost"
                onClick={() => {
                  media.pause();
                  setManageSongs(true);
                }}
              >
                <LibraryBig size={15} />
                本地作品
              </button>
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
                保存草稿
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
              <button
                className="button primary small"
                disabled={!source || !status.ready || status.preparing || !chart.songId}
                onClick={beginPublish}
              >
                <Send size={15} />
                发布到曲库
              </button>
            </div>
          </div>
          <div className="stage-grid">
            <div className="stage-left">
              {mode === 'player' && <PracticeCover chart={chart} media={media} />}
              {(mode === 'editor' || mode === 'player') && (
                <Player
                  chart={chart}
                  media={media}
                  showGuide={mode === 'editor'}
                  noteSpeed={noteSpeed}
                />
              )}
            </div>
            <div className="stage-right">
              {mode === 'player' && (
                <PracticeMasthead
                  title={chart.title}
                  returnLabel={playOrigin === 'library' ? 'SELECT MUSIC' : 'WORKBENCH'}
                  onReturn={() => {
                    media.pause();
                    setMode(playOrigin === 'library' ? 'songs' : 'editor');
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
                      {mode === 'player'
                        ? audioOutputErrorMessage(media.element?.error ?? null) ||
                          'Video unavailable. Select the video again.'
                        : status.error}
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
                {mode === 'player' && <Transport media={media} notify={notify} />}
              </section>
            </div>
            {mode === 'player' && <div className="album-hinge" aria-hidden="true" />}
          </div>
          {mode !== 'player' && <Transport media={media} notify={notify} />}
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
              publication={
                <PublicationFields
                  difficulty={difficulty}
                  albumId={draftMeta.albumId}
                  cover={draftMeta.cover}
                  albums={library.albums}
                  media={media}
                  onChange={(values) => {
                    void updatePublication(values);
                  }}
                  onAlbums={() => {
                    media.pause();
                    setManageAlbums(true);
                  }}
                  notify={notify}
                />
              }
            />
          )}
          <div className="workspace-bottom" hidden={mode !== 'editor'}>
            <span>EDITOR / 空格 播放暂停 · Ctrl+S 保存</span>
            <button
              disabled={!source}
              onClick={() => {
                setPlayOrigin('editor');
                leaveEditor(() => setMode('player'));
              }}
            >
              进入跟练
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </main>
      {mode === 'player' && startPending && !busy && !preparation.pending && status.ready && (
        <GameStartCountdown
          key={projectRevision}
          onComplete={completeCountdown}
          onCancel={() => {
            setStartPending(false);
            setMode('songs');
          }}
        />
      )}
      {(mode === 'editor' || mode === 'player') &&
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
          document.body,
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
          document.body,
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
      {settings && (
        <ModalBackdrop onClose={() => setSettings(false)}>
          <section
            className="modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭设置"
              onClick={() => setSettings(false)}
            >
              <X />
            </button>
            <h2 id="settings-title">全局设置</h2>
            <div className="note-speed-setting">
              <div className="note-speed-heading">
                <label htmlFor="note-speed">音符流速</label>
                <output htmlFor="note-speed">{noteSpeed.toFixed(1)}</output>
              </div>
              <input
                id="note-speed"
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={noteSpeed}
                onChange={(event) => changeNoteSpeed(Number(event.target.value))}
              />
              <div className="note-speed-scale" aria-hidden="true">
                <span>0.5 · 慢</span>
                <span>10 · 快</span>
              </div>
            </div>
            <p>默认 {DEFAULT_NOTE_SPEED.toFixed(1)}。所有曲目共用，自动记住你的选择。</p>
            <MenuMusicSettings music={menuMusic} />
            <div className="modal-actions">
              <button className="button light" onClick={() => changeNoteSpeed(DEFAULT_NOTE_SPEED)}>
                恢复默认
              </button>
              <button className="button primary" onClick={() => setSettings(false)}>
                完成
              </button>
            </div>
          </section>
        </ModalBackdrop>
      )}
      {manageSongs && (
        <SongManager
          songs={library.songs}
          onClose={() => setManageSongs(false)}
          onOpen={editSong}
          onWithdraw={withdraw}
          onDelete={deleteSong}
        />
      )}
      {manageAlbums && (
        <AlbumManager
          albums={library.albums}
          onSave={library.saveAlbum}
          onClose={() => setManageAlbums(false)}
          notify={notify}
        />
      )}
      {publishing && (
        <PublishDialog
          edition={{ chart, ...draftMeta, updatedAt: Date.now() }}
          difficulty={difficulty}
          albums={library.albums}
          updating={!!library.songs.find((s) => s.id === chart.songId)?.released[difficulty]}
          onClose={() => setPublishing(false)}
          onPublish={publish}
          onDifficulty={(difficulty) => updatePublication({ difficulty })}
        />
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
                  绘制类型可直接选 TAP / HOLD / SWAY；选中音符后，也能在右侧“类型”中转换。 S
                  切换选择工具，E 切换编辑工具。选择工具支持框选，长条两端可以拉伸。
                  可拖往支持相应方向的轨道；选中后按 F 或“反向”翻转方向，ARMS 拳套用 F 互换 L/R。
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
                  Ctrl+S 保存本地草稿，Ctrl+Shift+S 导出 JSON 副本。在“曲目”里选择难度、专辑与曲绘，
                  点击“发布到曲库”后可从音游模式游玩。编辑草稿不会改变已发布的谱面。
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
