import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
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
  Settings,
  LibraryBig,
  Send,
  Sun,
  X,
} from 'lucide-react';
import { blankChart, parseChart, serializeChart, type Chart, type PlayRange } from './model';
import { playableChart } from './play-range';
import { historyReducer } from './editing';
import {
  MediaController,
  audioOutputErrorMessage,
  useMediaStatus,
  type GameplayFrameRate,
} from './media';
import { usePlayerPreparation } from './usePlayerPreparation';
import { isTyping } from './recording';
import { DEFAULT_NOTE_SPEED } from './timing';
import { useLibrary } from './useLibrary';
import {
  latestEdition,
  updateWorkingDraft,
  saveNamedDraft,
  overwriteActiveDraft,
  selectNamedDraft,
  editionsIn,
  publishSong,
  unpublishSong,
  type ChartType,
  type Edition,
  type Song,
} from './library';
import { coverFromVideo } from './cover';
import { LibraryMenu } from './views/LibraryMenu';
import { AlbumTuning } from './components/AlbumDeck';
import { AlbumHousing } from './components/AlbumHousing';
import {
  AlbumManager,
  PublicationFields,
  PublishDialog,
  SongManager,
  SaveDraftDialog,
} from './components/LibraryControls';
import { MusicPulse } from './components/MenuMusic';
import { MenuSettings, SettingsGearHalo } from './components/MenuSettings';
import { MenuHighlightContext, useMenuHighlight } from './useCardHighlight';
import { useMenuMusic } from './useMenuMusic';
import { useMenuSounds } from './useMenuSounds';
import { useMenuCardPress } from './useMenuCardPress';
import { Player } from './views/Player';
import { Editor, type EditorHandle } from './views/Editor';
import { Home } from './views/Home';
import { Transport } from './components/Transport';
import { chartTypeFrom } from './chart-types';
import {
  PracticeBackdrop,
  PracticeCover,
  PracticeMasthead,
  PracticeStartupLighting,
} from './components/PracticeArtwork';
import { PracticePause } from './components/PracticePause';
import { AfterShow } from './components/AfterShow';
import { AfterShowCelebration } from './components/AfterShowCelebration';
import { AfterShowSnap } from './components/AfterShowSnap';
import { afterShowTrackNumber } from './after-show-snap';
import { afterShowLightingStyle, beginAfterShowAudio, nextAfterShowTrack } from './after-show';
import { DraftSaveMenu } from './components/DraftSaveMenu';
import { FitLog } from './components/FitLog';
import { useFitLogRecording } from './useFitLog';
import { ModalBackdrop } from './components/ModalBackdrop';
import { GameStartCountdown } from './components/GameStartCountdown';
import { GameEntrance } from './components/GameEntrance';
import { MenuTransition } from './components/MenuTransition';
import { LiquidMenuTransition } from './components/LiquidMenuTransition';
import { useMenuViewport } from './useMenuViewport';
import { EditorPreviewResize } from './components/EditorPreviewResize';
import { FitnessGenerateButton } from './components/FitnessGenerateButton';
import type { FitnessResult } from './fitness/generate';
import { menuPortalRoot } from './menu-viewport';
import { exportSongPackLocally } from './export-song-pack';
import { storeMapVideo } from './maps-workspace';
import { readyCountdownStyle, type ReadyCountdownPhase } from './ready-countdown';
import {
  prepareVideo,
  readStoredVideo,
  releaseVideo,
  resolveVideo,
  videoPicker,
  type PreparedVideo,
  type StoredVideo,
  type VideoAsset,
  type VideoFileHandle,
} from './local-media';

type OpenContext = {
  play?: boolean;
  edition?: Edition;
  legacy?: boolean;
  draftId?: string | null;
  working?: boolean;
};
const LAST_DRAFT_KEY = 'waifu-last-draft';
const DRAFT_KEY = 'waifu-fit-player-draft-v1';
const WORKBENCH_THEME_KEY = 'waifu-fit-player-workbench-theme';
const NOTE_SPEED_KEY = 'waifu-fit-player-note-speed';
const GAMEPLAY_FRAME_RATE_KEY = 'waifu-fit-player-gameplay-frame-rate';
const SE_VOLUME_KEY = 'waifu-fit-player-se-volume';
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
  const menuHighlight = useMenuHighlight();
  return (
    <MenuHighlightContext.Provider value={menuHighlight}>
      <AppContent menuHighlight={menuHighlight} />
    </MenuHighlightContext.Provider>
  );
}

function AppContent({ menuHighlight }: { menuHighlight: ReturnType<typeof useMenuHighlight> }) {
  const [initial] = useState(() => blankChart());
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial,
    future: [],
  });
  const chart = history.present;
  const gameChart = useMemo(() => playableChart(chart), [chart]);
  const editor = useRef<EditorHandle>(null);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(chart) !== saved;
  const [media] = useState(() => new MediaController());
  const status = useMediaStatus(media);
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<'home' | 'albums' | 'songs' | 'player' | 'editor'>('home');
  const preparation = usePlayerPreparation(
    media,
    source,
    mode === 'player' ? gameChart : chart,
    mode === 'player',
  );
  const objectUrl = useRef<string | null>(null);
  const activeVideo = useRef<PreparedVideo | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [binding, setBinding] = useState<VideoRequest | null>(null);
  const [busy, setBusy] = useState('');
  const working = useRef(false);
  const [menuTransition, setMenuTransition] = useState<{
    next: 'home' | 'albums' | 'songs' | 'player';
    direction: 'forward' | 'back';
    phase: 'cover' | 'hold' | 'reveal';
    liquid?: boolean;
    intro?: boolean;
  } | null>(() =>
    matchMedia('(prefers-reduced-motion: reduce)').matches
      ? null
      : {
          next: 'home',
          direction: 'back',
          phase: 'hold',
          liquid: true,
          intro: true,
        },
  );
  const playOnCovered = useRef<(() => void) | null>(null);
  const [playLoadComplete, setPlayLoadComplete] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const renderPreparing =
    menuTransition?.next === 'player' &&
    menuTransition.phase === 'hold' &&
    mode === 'player' &&
    playLoadComplete &&
    !preparation.pending;
  const finishRenderPreparation = useCallback(() => {
    setMenuTransition((current) =>
      current?.next === 'player' && current.phase === 'hold'
        ? { ...current, phase: 'reveal' }
        : current,
    );
  }, []);
  useEffect(() => {
    if (
      playLoadComplete &&
      menuTransition?.next === 'player' &&
      menuTransition.phase === 'hold' &&
      (mode !== 'player' || preparation.error)
    )
      finishRenderPreparation();
  }, [playLoadComplete, menuTransition, mode, preparation.error, finishRenderPreparation]);
  const menuPage = mode === 'home' || mode === 'albums' || mode === 'songs';
  useMenuViewport(menuPage || mode === 'player');
  useMenuCardPress(menuPage);
  const playStart = chart.playRange?.startMs;
  const playEnd = chart.playRange?.endMs;
  useLayoutEffect(() => {
    media.setPlaybackRange(
      mode === 'player' && playStart !== undefined && playEnd !== undefined
        ? { startMs: playStart, endMs: playEnd }
        : null,
    );
    return () => media.setPlaybackRange(null);
  }, [media, mode, source, playStart, playEnd]);
  const navigateMenu = (next: 'home' | 'albums' | 'songs') => {
    if (menuTransition || next === mode) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMode(next);
      return;
    }
    const pages = ['home', 'albums', 'songs'];
    setMenuTransition({
      next,
      direction: pages.indexOf(next) > pages.indexOf(mode) ? 'forward' : 'back',
      phase: 'cover',
      liquid: (mode === 'home' && next === 'albums') || (mode === 'albums' && next === 'home'),
    });
  };
  const [settings, setSettings] = useState(false);
  const menuSettingsTrigger = useRef<HTMLButtonElement>(null);
  const [seVolume, setSeVolume] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(SE_VOLUME_KEY) ?? 0.5);
      return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.5;
    } catch {
      return 0.5;
    }
  });
  const changeSeVolume = (value: number) => {
    setSeVolume(value);
    try {
      localStorage.setItem(SE_VOLUME_KEY, String(value));
    } catch {
      // Keep the preference for this session if local storage is unavailable.
    }
  };
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
  const [gameplayFrameRate, setGameplayFrameRate] = useState<GameplayFrameRate>(() => {
    try {
      const stored = localStorage.getItem(GAMEPLAY_FRAME_RATE_KEY);
      return stored === 'display' ? 'display' : stored === '120' ? 120 : 60;
    } catch {
      return 60;
    }
  });
  useLayoutEffect(() => {
    media.setRenderFrameRate(gameplayFrameRate);
  }, [media, gameplayFrameRate]);
  const changeGameplayFrameRate = (value: GameplayFrameRate) => {
    setGameplayFrameRate(value);
    try {
      localStorage.setItem(GAMEPLAY_FRAME_RATE_KEY, String(value));
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
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [saveDraftOpen, setSaveDraftOpen] = useState(false);
  const staleDraft = useRef(false);
  const savedDraftMeta = useRef(JSON.stringify({ albumId: '', cover: '' }));
  const [playOrigin, setPlayOrigin] = useState<'editor' | 'library'>('editor');
  const [fitLogAttempt, setFitLogAttempt] = useState(0);
  useFitLogRecording(
    media,
    gameChart,
    mode === 'player' && playOrigin === 'library',
    fitLogAttempt,
  );
  const [albumId, setAlbumId] = useState('all');
  const [albumPlayerOpen, setAlbumPlayerOpen] = useState(false);
  const [albumTuning, setAlbumTuning] = useState<'cover' | 'reveal' | null>(null);
  const [selectedSong, setSelectedSong] = useState('');
  const previewSelection = useRef(selectedSong);
  previewSelection.current = selectedSong;
  const shuffleAlbumPreview = useCallback(() => {
    const songs = library.songs.filter((song) => editionsIn(song, albumId).length);
    const others = songs.filter((song) => song.id !== previewSelection.current);
    const pool = others.length ? others : songs;
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next || next.id === previewSelection.current) return false;
    previewSelection.current = next.id;
    setSelectedSong(next.id);
    return true;
  }, [library.songs, albumId]);
  useEffect(() => {
    if (mode === 'albums' && albumPlayerOpen) shuffleAlbumPreview();
  }, [mode, albumPlayerOpen, shuffleAlbumPreview]);
  const [selectedChartType, setSelectedChartType] = useState<ChartType>('dance');
  const [coverSeed] = useState(Math.random);
  const [manageSongs, setManageSongs] = useState(false);
  const [manageAlbums, setManageAlbums] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const deletedSongs = useRef(new Set<string>());
  const [readyPhase, setReadyPhase] = useState<ReadyCountdownPhase | null>(null);
  const [countdownOrigin, setCountdownOrigin] = useState<'start' | 'resume'>('start');
  const startPending = readyPhase === 'waiting' || readyPhase === 'counting';
  const [gamePauseOpen, setGamePauseOpen] = useState(false);
  const [afterShow, setAfterShow] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [afterShowRewardReady, setAfterShowRewardReady] = useState(false);
  const [afterShowPhotoStarted, setAfterShowPhotoStarted] = useState(false);
  const afterShowSummaryReady = afterShow && afterShowRewardReady;
  const [resultMusicReady, setResultMusicReady] = useState(false);
  useEffect(() => {
    if (mode !== 'player') {
      setAfterShow(false);
      setFinishing(false);
    }
  }, [mode]);
  useEffect(
    () =>
      media.subscribeEnded(() => {
        if (mode !== 'player' || startPending || gamePauseOpen || preparation.pending) return;
        setGamePauseOpen(false);
        setReadyPhase(null);
        setAfterShowRewardReady(false);
        setAfterShowPhotoStarted(false);
        setFinishing(true);
      }),
    [media, mode, startPending, gamePauseOpen, preparation.pending],
  );
  const nextTrack = useMemo(
    () => nextAfterShowTrack(library.songs, albumId, chart.songId, chart.chartType ?? 'dance'),
    [library.songs, albumId, chart.songId, chart.chartType],
  );
  const finishedTrackNumber = useMemo(
    () => afterShowTrackNumber(library.songs, albumId, chart.songId),
    [library.songs, albumId, chart.songId],
  );
  useLayoutEffect(() => {
    if (mode !== 'player' || gamePauseOpen) setReadyPhase(null);
  }, [mode, gamePauseOpen]);
  const gamePauseTrigger = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    // The full pause menu is an explicit command, not a side effect of stopping media.
    if (mode !== 'player' || startPending || preparation.pending || status.playing)
      setGamePauseOpen(false);
  }, [mode, startPending, preparation.pending, status.playing]);
  const [previewAsset, setPreviewAsset] = useState<string>();
  const [previewRange, setPreviewRange] = useState<PlayRange>();
  const [previewFromStart, setPreviewFromStart] = useState(false);
  const previewSong = useCallback(
    (assetId: string | undefined, range?: PlayRange, fromStart = false) => {
      setPreviewAsset(assetId);
      setPreviewRange(range);
      setPreviewFromStart(fromStart);
    },
    [],
  );
  const menuMusic = useMenuMusic(
    mode === 'player' && afterShow && !menuTransition
      ? 'result'
      : mode === 'songs' || (mode === 'albums' && albumPlayerOpen)
        ? 'preview'
        : mode === 'home' || mode === 'albums'
          ? 'theme'
          : null,
    previewAsset,
    notify,
    status.volume,
    previewRange,
    mode === 'albums' && albumPlayerOpen,
    seVolume,
    shuffleAlbumPreview,
    previewFromStart,
    resultMusicReady,
  );
  const playMenuSound = useMenuSounds(seVolume);
  const celebrationSound = useRef(playMenuSound);
  celebrationSound.current = playMenuSound;
  useEffect(() => {
    setResultMusicReady(false);
    if (mode !== 'player' || !afterShow) {
      setAfterShowRewardReady(false);
      return;
    }
    if (!afterShowRewardReady) return;
    return beginAfterShowAudio(celebrationSound.current, () => setResultMusicReady(true));
  }, [mode, afterShow, afterShowRewardReady]);
  const openSettings = () => {
    setAlbumPlayerOpen(false);
    playMenuSound('settings');
    setSettings(true);
  };
  const closeSettings = () => {
    playMenuSound('back');
    setSettings(false);
  };
  const chartType = chart.chartType ?? 'dance';
  const activeDraftName = library.songs
    .find((s) => s.id === chart.songId)
    ?.namedDrafts?.find((d) => d.id === activeDraftId)?.name;
  const persistDraft = useCallback(
    async (overwriteNamed = false) => {
      if (!source || !chart.songId || deletedSongs.current.has(chart.songId)) return;
      if (staleDraft.current) throw new Error('磁盘谱面已更新，请从本地作品重新打开后再编辑。');
      const edition: Edition = {
        chart: structuredClone(chart),
        ...draftMeta,
        updatedAt: Date.now(),
      };
      const result = await updateSong(chart.songId, (previous) => {
        if (deletedSongs.current.has(chart.songId!)) return previous;
        const type = chart.chartType ?? 'dance';
        const next = updateWorkingDraft(
          previous ?? { id: chart.songId!, drafts: {}, released: {} },
          type,
          edition,
          activeDraftId,
        );
        return overwriteNamed ? overwriteActiveDraft(next, type) : next;
      });
      setSaved(JSON.stringify(chart));
      savedDraftMeta.current = JSON.stringify(draftMeta);
      try {
        localStorage.setItem(
          LAST_DRAFT_KEY,
          JSON.stringify({ id: chart.songId, chartType: chart.chartType ?? 'dance' }),
        );
      } catch {
        /* The draft itself is in maps. */
      }
      return result;
    },
    [chart, draftMeta, source, updateSong, activeDraftId],
  );
  useEffect(() => {
    if (mode === 'player') setNotice('');
  }, [mode]);
  const completeCountdown = useCallback(() => {
    setReadyPhase('go');
    playMenuSound('mode');
    if (media.element?.paused)
      void media.toggle().catch(() => {
        setReadyPhase(null);
        notify('请点击播放开始。');
      });
  }, [media, notify, playMenuSound]);
  const finishCountdown = useCallback(() => setReadyPhase(null), []);
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
      if (working.current || staleDraft.current) return;
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
    const existingSong = library.songs.find((song) =>
      next.songId
        ? song.id === next.songId
        : latestEdition(song).chart.title === next.title &&
          latestEdition(song).chart.videoHint.fileName === next.videoHint.fileName,
    );
    const songId = next.songId ?? existingSong?.id ?? crypto.randomUUID();
    // Adopt/copy once before saving; the running project no longer depends on a browser handle.
    const checked = await prepareVideo(asset);
    let video = checked;
    try {
      if (!context?.play || persist) {
        const diskAsset = await storeMapVideo(songId, next.title, asset);
        if (diskAsset.kind !== 'file') {
          video = {
            src: diskAsset.url,
            ownedUrl: false,
            hint: { ...checked.hint, assetId: diskAsset.id, fileName: diskAsset.fileName },
          };
          releaseVideo(checked);
        }
      }
    } catch (error) {
      releaseVideo(checked);
      throw error;
    }
    let paired: Chart;
    try {
      paired = parseChart(
        {
          ...next,
          songId,
          chartType: next.chartType ?? 'dance',
          videoHint: video.hint,
        },
        video.hint.durationMs,
      );
    } catch (error) {
      releaseVideo(video);
      throw error;
    }
    const known = library.songs.find((s) => s.id === paired.songId);
    const edition = context?.edition ?? known?.drafts[paired.chartType ?? 'dance'];
    const meta = { albumId: edition?.albumId ?? '', cover: edition?.cover ?? '' };
    try {
      if (!context?.play)
        await updateSong(paired.songId!, (previous) => {
          const song = previous ?? { id: paired.songId!, drafts: {}, released: {} };
          const selected = context?.working
            ? song
            : selectNamedDraft(song, paired.chartType ?? 'dance', context?.draftId);
          return updateWorkingDraft(
            selected,
            paired.chartType ?? 'dance',
            { chart: paired, ...meta, updatedAt: Date.now() },
            context?.draftId,
          );
        });
      else if (
        next.videoHint.assetId !== paired.videoHint.assetId ||
        next.videoHint.fileName !== paired.videoHint.fileName ||
        next.videoHint.durationMs !== paired.videoHint.durationMs
      )
        await updateSong(paired.songId!, (previous) => {
          if (!previous) return previous;
          const d = paired.chartType ?? 'dance';
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
    savedDraftMeta.current = JSON.stringify(meta);
    staleDraft.current = false;
    setActiveDraftId(context?.draftId ?? null);
    setFinishing(false);
    setAfterShow(false);
    setPlayOrigin(context?.play ? 'library' : 'editor');
    setCountdownOrigin('start');
    setReadyPhase(context?.play ? 'waiting' : null);
    if (!context?.play) {
      try {
        localStorage.setItem(
          LAST_DRAFT_KEY,
          JSON.stringify({ id: paired.songId, chartType: paired.chartType }),
        );
        if (context?.legacy) localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* maps remains authoritative. */
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
    // A directly opened JSON can finish while the initial library scan/intro is still pending.
    // Its late home callback must not replace the project we just installed.
    setMenuTransition((current) => (current?.intro ? null : current));
    setMode(context?.play ? 'player' : 'editor');
    setBinding(null);
  };
  const openProject = async (next: Chart, isSaved: boolean, context?: OpenContext) => {
    const result = await resolveVideo(next.videoHint.assetId, true);
    if ('asset' in result) {
      try {
        await installProject(next, result.asset, isSaved, false, context);
        if (!context?.play)
          notify(isSaved ? '作品已打开，关联视频已自动载入。' : '草稿与关联视频已恢复。');
      } catch (error) {
        if (error instanceof Error && /磁盘谱面/.test(error.message)) {
          await library.refresh();
          staleDraft.current = true;
          setBinding(null);
          setManageSongs(true);
          notify('磁盘谱面已更新，请在本地作品中重新打开。视频关联仍然有效。');
          return;
        }
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
            chartType: 'dance' as const,
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
      notify(request.kind === 'new' ? '作品与视频已保存到 maps。' : '视频关联已更新并写入 maps。');
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
      await persistDraft(!exportCopy);
      if (exportCopy) {
        const url = URL.createObjectURL(
          new Blob([serializeChart(chart, status.durationMs || undefined)], {
            type: 'application/json',
          }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `${chart.title.replace(/[<>:"/\\|?*]/g, '_')}_${chartType}.wfp.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notify(
        exportCopy
          ? 'JSON 副本已导出，草稿已写入 maps。'
          : '草稿已写入 maps 曲目目录。已发布的谱面不受影响。',
      );
      return true;
    } catch (error) {
      notify(`保存失败：${(error as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };
  const pauseGame = () => {
    if (afterShow || finishing || startPending || preparation.pending || !status.ready) return;
    playMenuSound('settings');
    media.pause();
    setGamePauseOpen(true);
  };
  const resumeGame = (sound: 'mode' | 'song' = 'mode') => {
    if (afterShow || finishing || !status.ready || status.preparing || startPending) return;
    if (!media.element?.paused) {
      setGamePauseOpen(false);
      return;
    }
    playMenuSound(sound);
    setGamePauseOpen(false);
    setCountdownOrigin('resume');
    setReadyPhase('waiting');
    // Prepare the paused frame without seeking or starting the shared media clock.
    preparation.retry();
  };
  const toggleGamePlayback = () => {
    if (afterShow || finishing) return;
    if (gamePauseOpen || media.element?.paused) resumeGame();
    else pauseGame();
  };
  const restartGame = () => {
    if (!status.ready || status.preparing || startPending) return;
    playMenuSound('song');
    media.pause();
    setFitLogAttempt((attempt) => attempt + 1);
    media.seek(playStart ?? 0);
    setFinishing(false);
    setAfterShow(false);
    setGamePauseOpen(false);
    setCountdownOrigin('start');
    setReadyPhase('waiting');
    // Reuse the opening sequence after the seeked video frame is ready.
    preparation.retry();
  };
  const backToSelect = () => {
    playMenuSound('back');
    media.pause();
    setFinishing(false);
    setAfterShow(false);
    setGamePauseOpen(false);
    setReadyPhase(null);
    setSelectedSong(chart.songId ?? selectedSong);
    setSelectedChartType(chartType);
    setMode('songs');
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
        saveDraftOpen ||
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
      if (mode === 'player' && finishing) {
        e.preventDefault();
        return;
      }
      if (mode === 'player' && afterShow) return;
      if (mode === 'player' && (e.key === 'Escape' || e.key === 'Backspace')) {
        e.preventDefault();
        if (!e.repeat) gamePauseOpen ? resumeGame() : pauseGame();
      } else if (mode === 'editor' && mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mode === 'editor' && mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.code === 'Space' && (mode === 'editor' || mode === 'player')) {
        e.preventDefault();
        if (!e.repeat && !(mode === 'player' && gamePauseOpen))
          void media.toggle().catch(() => notify('Press Play to start.'));
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
  const openSongManager = () => {
    media.pause();
    void runTask('正在读取本地作品…', async () => {
      if (
        mode === 'editor' &&
        source &&
        (dirty || savedDraftMeta.current !== JSON.stringify(draftMeta))
      )
        await persistDraft();
      const changed = await library.refresh();
      if (source && changed.includes(chart.songId ?? '')) staleDraft.current = true;
      setManageSongs(true);
    });
  };
  const enterEditor = () => {
    media.pause();
    if (source && playOrigin === 'editor') {
      setMode('editor');
      return;
    }
    void runTask('正在打开草稿…', async () => {
      await library.load();
      const songs = library.snapshot();
      let last: { id: string; chartType: ChartType } | undefined;
      try {
        const saved = JSON.parse(localStorage.getItem(LAST_DRAFT_KEY) || 'null');
        if (saved && typeof saved.id === 'string') {
          last = { id: saved.id, chartType: chartTypeFrom(saved.chartType ?? saved.difficulty) };
          localStorage.setItem(LAST_DRAFT_KEY, JSON.stringify(last));
        }
      } catch {
        /* Start an empty editor. */
      }
      const song = songs.find((s) => s.id === last?.id);
      const edition =
        song?.drafts[last?.chartType ?? 'dance'] ??
        songs.flatMap((s) => Object.values(s.drafts)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (edition) {
        const owner = songs.find((s) => s.drafts[edition.chart.chartType ?? 'dance'] === edition);
        await openProject(edition.chart, true, {
          edition,
          draftId: owner?.activeDrafts?.[edition.chart.chartType ?? 'dance'],
          working: true,
        });
      } else {
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
  const playSong = async (song: Song, d: ChartType) => {
    const edition = song.released[d];
    if (!edition || menuTransition || working.current) return;
    setSelectedSong(song.id);
    setSelectedChartType(d);
    const open = () =>
      runTask('正在准备曲目…', () => openProject(edition.chart, true, { play: true, edition }));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await open();
      return;
    }
    await new Promise<void>((resolve) => {
      setPlayLoadComplete(false);
      setRenderProgress(0);
      playOnCovered.current = () => {
        void open().finally(() => {
          setPlayLoadComplete(true);
          resolve();
        });
      };
      setMenuTransition({ next: 'player', direction: 'forward', phase: 'cover' });
    });
  };
  const editSong = (song: Song, d: ChartType, published: boolean, draftId?: string) => {
    const edition = published
      ? song.released[d]
      : draftId
        ? song.namedDrafts?.find((n) => n.id === draftId && n.chartType === d)
        : song.drafts[d];
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
      if (
        mode === 'editor' &&
        !staleDraft.current &&
        (dirty || savedDraftMeta.current !== JSON.stringify(draftMeta))
      )
        await persistDraft();
      if (mode === 'player' && chart.songId === song.id && chartType === d && !draftId) {
        // The playing edition and its media are already loaded. Keep the paused
        // position while entering its draft, after the existing overwrite guard.
        media.pause();
        await persistDraft();
        setGamePauseOpen(false);
        setReadyPhase(null);
        setPlayOrigin('editor');
        setMode('editor');
      } else {
        const fresh = library.snapshot().find((s) => s.id === song.id) ?? song;
        const chosen = published
          ? fresh.released[d]
          : draftId
            ? fresh.namedDrafts?.find((n) => n.id === draftId && n.chartType === d)
            : fresh.drafts[d];
        if (!chosen) throw new Error('未找到选中的草稿。');
        await openProject(chosen.chart, true, {
          edition: chosen,
          draftId: published ? null : draftId || fresh.activeDrafts?.[d],
          working: !published && !draftId,
        });
      }
    });
  };
  const editCurrentGame = () => {
    playMenuSound('mode');
    const song = library.songs.find((s) => s.id === chart.songId);
    if (playOrigin === 'library' && song) {
      editSong(song, chartType, true);
      return;
    }
    // A studio playtest returns to the same in-memory draft and undo history.
    media.pause();
    setGamePauseOpen(false);
    setReadyPhase(null);
    setPlayOrigin('editor');
    setMode('editor');
  };
  const withdraw = (song: Song, d: ChartType) => {
    if (
      !window.confirm(
        `撤下《${latestEdition(song).chart.title}》的 ${d.toUpperCase()}？只从音游模式移除，保留该类型草稿。`,
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
        `彻底从 WAIFU 删除《${latestEdition(song).chart.title}》？将删除 FITNESS / DANCE 的草稿、发布版本和曲绘。磁盘原始文件不会删除。`,
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
  const exportPack = (selection: Song | Song[]) => {
    media.pause();
    setManageSongs(false);
    void runTask('正在准备曲包视频与图片…', async () => {
      const file = await exportSongPackLocally(selection, (progress) =>
        setBusy(`正在本地生成曲包… ${Math.round(progress * 100)}%`),
      );
      notify(`曲包已完整保存：${file}`);
    });
  };
  const updatePublication = async (values: {
    chartType?: ChartType;
    albumId?: string;
    cover?: string;
  }) => {
    if (values.chartType && values.chartType !== chartType) {
      const existing = library.songs.find((s) => s.id === chart.songId)?.drafts[values.chartType];
      if (
        existing &&
        !window.confirm(
          `将当前谱面复制为 ${values.chartType.toUpperCase()} 草稿，替换该类型现有草稿？两种类型的发布版本都不改变。`,
        )
      )
        return;
      try {
        await persistDraft();
        setActiveDraftId(null);
        edit({ ...chart, chartType: values.chartType });
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
  const applyGeneratedFitness = async (result: FitnessResult) => {
    if (!chart.songId || result.chart.songId !== chart.songId)
      throw new Error('作品已切换，未保存旧结果。');
    const existing = library.songs.find((s) => s.id === chart.songId)?.drafts.fitness;
    const currentFitness = chartType === 'fitness' ? chart : existing?.chart;
    if (
      currentFitness?.notes.length &&
      !window.confirm(
        `已生成 ${result.report.noteCount} 个动作。替换本曲现有的 ${currentFitness.notes.length} 个 FITNESS 草稿动作？Dance 和发布版本保持不变。`,
      )
    )
      return false;
    await persistDraft();
    const expected = JSON.stringify(currentFitness);
    const meta = {
      albumId: existing?.albumId ?? draftMeta.albumId,
      cover: existing?.cover ?? draftMeta.cover,
    };
    await updateSong(chart.songId, (old) => {
      if (!old) throw new Error('作品已移除。');
      if (JSON.stringify(old.drafts.fitness?.chart) !== expected)
        throw new Error('FITNESS 草稿已变化，未覆盖。');
      return {
        ...old,
        ...updateWorkingDraft(
          old,
          'fitness',
          { chart: result.chart, ...meta, updatedAt: Date.now() },
          null,
        ),
      };
    });
    setDraftMeta(meta);
    setActiveDraftId(null);
    reset(result.chart, true);
    setProjectRevision((revision) => revision + 1);
    notify(`已生成并保存 FITNESS 草稿：${result.report.noteCount} 个动作，可直接试玩。`);
    return true;
  };
  const publish = async () => {
    try {
      await persistDraft();
      await updateSong(chart.songId!, (song) => song && publishSong(song, chartType));
      setPublishing(false);
      notify(`${chartType.toUpperCase()} 已发布到曲库。`);
    } catch (error) {
      notify(`发布失败：${(error as Error).message}`);
    }
  };

  return (
    <div
      className={`app ${mode === 'player' ? 'practice-app' : mode === 'editor' ? '' : 'menu-app'}`}
      data-workbench-theme={mode === 'editor' ? (workbenchDark ? 'dark' : 'light') : undefined}
      data-menu-settings={menuPage && settings ? 'open' : undefined}
      data-album-player={mode === 'albums' && albumPlayerOpen ? 'open' : undefined}
      data-album-tuning={albumTuning === 'reveal' || undefined}
      {...(menuPage ? menuHighlight.handlers : {})}
    >
      {mode === 'player' &&
        afterShow &&
        afterShowRewardReady &&
        createPortal(<AfterShowCelebration />, menuPortalRoot())}
      <div className="ambient-shape pink">
        <AlbumHousing open={mode === 'albums' && albumPlayerOpen} />
      </div>
      <div className="ambient-shape cyan">
        {menuPage && (
          <>
            <svg
              className="fit-log-corner-surface"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polygon points="0,0 1000,0 1000,1000 0,1000" />
            </svg>
            <div className="fit-log-corner-details" aria-hidden="true" />
          </>
        )}
      </div>
      <div className="ambient-dots" />
      {menuPage && (
        <FitLog
          mode={mode}
          blocked={
            !!menuTransition ||
            !!albumTuning ||
            !!binding ||
            help ||
            !!pending ||
            startPending ||
            preparation.pending
          }
        />
      )}
      {menuPage && (
        <button
          className="icon-button menu-settings"
          ref={menuSettingsTrigger}
          aria-label="全局设置"
          aria-expanded={settings}
          aria-controls="menu-settings-panel"
          inert={!!menuTransition || !!albumTuning}
          onClick={settings ? closeSettings : openSettings}
        >
          <SettingsGearHalo />
          <Settings size={96} />
        </button>
      )}
      {menuTransition?.liquid ? (
        <LiquidMenuTransition
          phase={menuTransition.phase}
          direction={menuTransition.direction}
          intro={menuTransition.intro}
          introLoad={library.load}
          onSound={playMenuSound}
          onCovered={() => {
            setMode(menuTransition.next);
            setMenuTransition({ ...menuTransition, phase: 'reveal' });
          }}
          onRevealed={() => setMenuTransition(null)}
        />
      ) : (
        menuTransition &&
        createPortal(
          menuTransition.next === 'player' ? (
            <GameEntrance
              phase={menuTransition.phase}
              progress={
                mode === 'player' && playLoadComplete
                  ? preparation.pending
                    ? preparation.progress * 0.7
                    : 0.7 + renderProgress * 0.3
                  : 0
              }
              onCovered={() => {
                setMenuTransition({ ...menuTransition, phase: 'hold' });
                const play = playOnCovered.current;
                playOnCovered.current = null;
                play?.();
              }}
              onRevealed={() => setMenuTransition(null)}
            />
          ) : (
            <MenuTransition
              phase={menuTransition.phase}
              direction={menuTransition.direction}
              onCovered={() => {
                setMode(menuTransition.next);
                setMenuTransition({ ...menuTransition, phase: 'reveal' });
              }}
              onRevealed={() => setMenuTransition(null)}
            />
          ),
          menuTransition.next === 'player' ? document.body : menuPortalRoot(),
        )
      )}
      {albumTuning &&
        createPortal(
          <AlbumTuning
            phase={albumTuning}
            onCovered={() => {
              setAlbumPlayerOpen(false);
              setMode('songs');
              setAlbumTuning('reveal');
            }}
            onRevealed={() => setAlbumTuning(null)}
          />,
          menuPortalRoot(),
        )}
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
        {menuPage && (
          <div
            className="menu-scene"
            inert={!!menuTransition || !!albumTuning}
            data-exit-to={menuTransition?.phase === 'cover' ? menuTransition.next : undefined}
            key={mode}
          >
            {mode === 'home' && (
              <Home
                music={menuMusic}
                onSound={playMenuSound}
                onPlay={() => {
                  playMenuSound('mode');
                  navigateMenu('albums');
                }}
                onCreate={() => {
                  playMenuSound('mode');
                  enterEditor();
                }}
              />
            )}
            {(mode === 'albums' || mode === 'songs') && (
              <MusicPulse music={menuMusic} waveform={false} />
            )}
            {(mode === 'albums' || mode === 'songs') && (
              <LibraryMenu
                page={mode}
                albums={library.albums}
                songs={library.songs}
                albumId={albumId}
                songId={selectedSong}
                chartType={selectedChartType}
                seed={coverSeed}
                musicPlaying={menuMusic.playing}
                music={menuMusic}
                playerOpen={albumPlayerOpen}
                onPlayerOpen={(open) => {
                  setAlbumPlayerOpen(open);
                  if (!open) setAlbumTuning(null);
                }}
                onAlbum={(id, enter) => {
                  setAlbumId(id);
                  if (enter) {
                    setAlbumTuning('cover');
                  }
                }}
                onSong={setSelectedSong}
                onChartType={(chartType) => {
                  playMenuSound('settings');
                  setSelectedChartType(chartType);
                }}
                onBack={() => {
                  playMenuSound('back');
                  navigateMenu(mode === 'songs' ? 'albums' : 'home');
                }}
                onSound={playMenuSound}
                onCreate={() => {
                  playMenuSound('mode');
                  enterEditor();
                }}
                onPlay={playSong}
                onPreview={previewSong}
                onEdit={(song, d) => {
                  playMenuSound('mode');
                  editSong(song, d, true);
                }}
              />
            )}
          </div>
        )}
        <div
          className={`album-workspace ${mode === 'editor' ? 'editing' : 'practice'}`}
          hidden={mode !== 'editor' && mode !== 'player'}
          data-ready={mode === 'player' && !renderPreparing ? (readyPhase ?? undefined) : undefined}
          data-render-preparing={renderPreparing ? '' : undefined}
          data-paused={mode === 'player' && gamePauseOpen ? '' : undefined}
          data-finished={mode === 'player' && afterShow ? '' : undefined}
          data-after-show={
            mode === 'player' && afterShow
              ? afterShowSummaryReady
                ? 'summary'
                : afterShowPhotoStarted
                  ? 'photo'
                  : 'waiting'
              : undefined
          }
          style={{ ...readyCountdownStyle, ...afterShowLightingStyle }}
        >
          {mode === 'player' && <PracticeBackdrop finished={afterShowSummaryReady} />}
          {mode === 'player' && (readyPhase !== null || gamePauseOpen || afterShowSummaryReady) && (
            <PracticeStartupLighting
              key={afterShowSummaryReady ? 'finish' : 'startup'}
              finishing={afterShowSummaryReady}
            />
          )}
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
                {`${chartType.toUpperCase()} DRAFT · ${chart.tempoSegments[0]?.bpm ?? 120} BPM · ${chart.notes.length} 个动作提示 · ${dirty ? '正在保存草稿…' : '草稿已保存'}`}
              </p>
            </div>
            <div className="workspace-actions" hidden={mode !== 'editor'}>
              <button
                className="button small ghost"
                onClick={() => {
                  media.pause();
                  openSongManager();
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
              <DraftSaveMenu
                disabled={saving || !status.ready}
                onSave={() => void save()}
                onSaveAs={() => {
                  media.pause();
                  setSaveDraftOpen(true);
                }}
              />
              <button
                className="icon-button export-button"
                title="导出 JSON 副本（Ctrl+Shift+S）"
                aria-label="导出 JSON"
                disabled={saving || !status.ready}
                onClick={() => void save(true)}
              >
                <Download size={17} />
              </button>
              <FitnessGenerateButton
                chart={chart}
                source={source}
                disabled={saving || !status.ready || status.preparing || !!busy || !chart.songId}
                onStart={() => media.pause()}
                onApply={applyGeneratedFitness}
              />
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
              {mode === 'player' && <span className="stage-skirt" aria-hidden="true" />}
              <div
                className="practice-performance"
                aria-hidden={afterShow || undefined}
                inert={afterShow}
              >
                {mode === 'player' && <PracticeCover chart={gameChart} media={media} />}
                {(mode === 'editor' || mode === 'player') && (
                  <Player
                    chart={mode === 'player' ? gameChart : chart}
                    media={media}
                    showGuide={mode === 'editor'}
                    noteSpeed={noteSpeed}
                    prepareEffects={renderPreparing}
                    onEffectsReady={finishRenderPreparation}
                    onPreparationProgress={setRenderProgress}
                    finishPhase={
                      mode === 'player'
                        ? finishing
                          ? 'tail'
                          : afterShow
                            ? 'finished'
                            : undefined
                        : undefined
                    }
                    onFinishTailComplete={() => {
                      if (mode !== 'player') return;
                      setFinishing(false);
                      setAfterShow(true);
                    }}
                  />
                )}
              </div>
              {mode === 'player' && afterShowSummaryReady && (
                <AfterShow
                  chart={gameChart}
                  durationMs={status.durationMs}
                  music={menuMusic}
                  hasNext={!!nextTrack}
                  disabled={
                    !!busy ||
                    !!binding ||
                    !!menuTransition ||
                    preparation.pending ||
                    help ||
                    settings
                  }
                  onEncore={restartGame}
                  onNext={async () => {
                    if (!nextTrack) return;
                    playMenuSound('song');
                    await playSong(nextTrack.song, nextTrack.chartType);
                  }}
                  onBack={backToSelect}
                  onSound={playMenuSound}
                />
              )}
              {mode === 'player' && gamePauseOpen && (
                <span className="paused-track-shade" aria-hidden="true" />
              )}
            </div>
            <div className="stage-right">
              {mode === 'player' && <span className="stage-skirt" aria-hidden="true" />}
              {mode === 'player' && (
                <PracticeMasthead
                  chart={gameChart}
                  cover={draftMeta.cover}
                  media={media}
                  paused={gamePauseOpen}
                  finished={afterShow}
                  pauseTrigger={gamePauseTrigger}
                  onPause={() => (gamePauseOpen ? resumeGame() : pauseGame())}
                  disabled={
                    afterShow || finishing || startPending || preparation.pending || !status.ready
                  }
                />
              )}
              <section className="video-panel" aria-label="Video">
                <div className="video-topline" hidden={mode === 'player'}>
                  <span>
                    <i />
                    {mode === 'editor' ? 'VIDEO PREVIEW' : 'YOUR PRIVATE STAGE'}
                  </span>
                  {mode === 'editor' ? <EditorPreviewResize /> : <span>↗</span>}
                </div>
                <div className="video-viewport">
                  <video
                    ref={media.attach}
                    src={source || undefined}
                    preload="auto"
                    playsInline
                    onDoubleClick={() =>
                      mode === 'player' ? toggleGamePlayback() : media.toggle().catch(() => {})
                    }
                  />
                  {mode === 'player' && afterShow && (
                    <AfterShowSnap
                      key={source}
                      media={media}
                      trackNumber={finishedTrackNumber}
                      onSound={playMenuSound}
                      onCapture={() => setAfterShowPhotoStarted(true)}
                      onReady={() => setAfterShowRewardReady(true)}
                    />
                  )}
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
                  {mode === 'player' && gamePauseOpen && (
                    <PracticePause
                      chart={gameChart}
                      cover={draftMeta.cover}
                      trigger={gamePauseTrigger}
                      onEdit={editCurrentGame}
                      onRestart={restartGame}
                      onBack={backToSelect}
                      onSound={playMenuSound}
                    />
                  )}
                  {mode === 'player' && readyPhase !== null && (
                    <GameStartCountdown
                      key={projectRevision}
                      cover={draftMeta.cover}
                      chartType={chartType}
                      resuming={countdownOrigin === 'resume'}
                      ready={
                        !menuTransition &&
                        menuMusic.quiet &&
                        !busy &&
                        !preparation.pending &&
                        status.ready
                      }
                      onPhase={setReadyPhase}
                      onComplete={completeCountdown}
                      onFinished={finishCountdown}
                      onCancel={() => {
                        playMenuSound('back');
                        if (countdownOrigin === 'resume') {
                          setReadyPhase(null);
                          setGamePauseOpen(true);
                          return;
                        }
                        setMenuTransition(null);
                        setReadyPhase(null);
                        setMode('songs');
                      }}
                      onSound={playMenuSound}
                    />
                  )}
                </div>
                <div className="video-caption" hidden={mode === 'player'}>
                  <span>
                    <Heart size={12} /> MOVE WITH YOUR FAVORITE
                  </span>
                  <span>VIDEO + MUSIC</span>
                </div>
                {mode === 'player' && afterShow && (
                  <div className="after-show-transport" aria-hidden="true" />
                )}
                {mode === 'player' && !afterShow && (
                  <Transport
                    media={media}
                    notify={notify}
                    playRange={chart.playRange}
                    onToggle={toggleGamePlayback}
                    onRestart={restartGame}
                    disabled={startPending || finishing}
                  />
                )}
              </section>
            </div>
            {mode === 'player' && <div className="album-hinge" aria-hidden="true" />}
          </div>
          {mode !== 'player' && <Transport media={media} notify={notify} />}
          {mode === 'editor' && (
            <Editor
              ref={editor}
              key={projectRevision}
              chart={chart}
              media={media}
              videoSource={source}
              onChange={edit}
              onUndo={undo}
              onRedo={redo}
              canUndo={!!history.past.length}
              canRedo={!!history.future.length}
              notify={notify}
              publication={
                <PublicationFields
                  chartType={chartType}
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
                  onSongs={() => {
                    playMenuSound('settings');
                    media.pause();
                    openSongManager();
                  }}
                  notify={notify}
                />
              }
            />
          )}
          <div className="workspace-bottom" hidden={mode !== 'editor'}>
            <span>EDITOR / 空格 播放暂停 · N 最后音符 · B 开头 · Ctrl+S 保存</span>
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
      {(mode === 'editor' || mode === 'player') &&
        preparation.pending &&
        (mode !== 'player' || readyPhase === null || !!preparation.error) &&
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
          menuPortalRoot(),
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
                  try {
                    await persistDraft(true);
                    const action = pending;
                    setPending(null);
                    action();
                  } catch (error) {
                    notify(`保存失败：${(error as Error).message}`);
                  }
                }}
              >
                保存并继续
              </button>
            </div>
          </section>
        </ModalBackdrop>
      )}
      {menuPage && (
        <MenuSettings
          open={settings}
          trigger={menuSettingsTrigger}
          onClose={closeSettings}
          onSound={playMenuSound}
          menuVolume={menuMusic.volume}
          onMenuVolume={menuMusic.setVolume}
          videoVolume={status.volume}
          onVideoVolume={media.setVolume}
          seVolume={seVolume}
          onSeVolume={changeSeVolume}
          noteSpeed={noteSpeed}
          onNoteSpeed={changeNoteSpeed}
          gameplayFrameRate={gameplayFrameRate}
          onGameplayFrameRate={changeGameplayFrameRate}
        />
      )}
      {saveDraftOpen && (
        <SaveDraftDialog
          defaultName={activeDraftName ? `${activeDraftName} 副本`.slice(0, 60) : ''}
          names={(library.songs.find((s) => s.id === chart.songId)?.namedDrafts ?? [])
            .filter((d) => d.chartType === chartType)
            .map((d) => d.name)}
          onClose={() => setSaveDraftOpen(false)}
          onSave={async (name) => {
            setSaving(true);
            try {
              await persistDraft();
              const stored = await updateSong(chart.songId!, (previous) => {
                if (!previous) throw new Error('作品已不存在。');
                return saveNamedDraft(previous, chartType, name);
              });
              setActiveDraftId(stored?.activeDrafts?.[chartType] ?? null);
              notify(`草稿「${name.trim()}」已保存到 maps。`);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
      {manageSongs && (
        <SongManager
          songs={library.songs}
          onClose={() => {
            playMenuSound('back');
            setManageSongs(false);
          }}
          onOpen={editSong}
          onWithdraw={withdraw}
          onDelete={deleteSong}
          onExport={exportPack}
          onExportSelected={exportPack}
        />
      )}
      {manageAlbums && (
        <AlbumManager
          albums={library.albums}
          onSave={library.saveAlbum}
          onClose={() => {
            playMenuSound('back');
            setManageAlbums(false);
          }}
          notify={notify}
        />
      )}
      {publishing && (
        <PublishDialog
          edition={{ chart, ...draftMeta, updatedAt: Date.now() }}
          chartType={chartType}
          albums={library.albums}
          updating={!!library.songs.find((s) => s.id === chart.songId)?.released[chartType]}
          onClose={() => {
            playMenuSound('back');
            setPublishing(false);
          }}
          onPublish={publish}
          onLocate={(id) => {
            setPublishing(false);
            editor.current?.locateEvent(id);
          }}
          onChartType={(chartType) => updatePublication({ chartType })}
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
                  八方向箭头表示动作方位，L/R 拳套表示对应手向前出拳；L/R/BOTH
                  手掌表示单手或双手水平前伸。TAP、HOLD、SWAY 共通。 箭头用手颜色：ANY 未指定白色，L
                  左手蓝色，R 右手红色，BOTH 双手紫色；H 循环换手，支持多选。 录谱使用方向键；Shift
                  + ←/→ 录 ↖/↗，Alt + ←/→ 录 ↙/↘，也支持数字小键盘八方向。 J/K 录左右拳套，U/I/O
                  录左手／右手／双手前伸。P 录入 CLAP 拍手，固定双手紫色，点按 TAP、长按 HOLD、Ctrl
                  + 长按 SWAY。其他动作长按 HOLD，Ctrl + 长按 SWAY；录谱时 H 修改后续箭头的用手。
                </p>
              </li>
              <li>
                <strong>STEP 踏步</strong>
                <p>
                  ← / → 录入左右踏步，↑ 录入 LEG RAISE 单次抬腿，长按 LEG HOLD 抬腿保持、Ctrl + 长按
                  SWAY。 LEG HOLD 用向上箭头表示抬腿，用颜色区分左右腿。↓ 直接录入 SPIN
                  原地转圈，长按决定时长。Shift + 左右跨两格；Alt + ← / → 录入 FOLLOW，Ctrl + Alt +
                  长按左右方向键录入 FOLLOW SWAY。类型菜单提供 TAP、FOLLOW、FOLLOW
                  SWAY、HOLD、SWAY、SPIN；箭头单独选择移动方向。 用脚颜色独立设置：L 左脚蓝色、R
                  右脚红色、BOTH 双脚紫色，H 循环，支持多选和所有类型。 F 只反转方向，普通左右踏步按
                  D 切换跨度。
                </p>
              </li>
              <li>
                <strong>保存，然后跟练</strong>
                <p>
                  Ctrl+S 保存本地草稿，Ctrl+Shift+S 导出 JSON
                  副本。在“曲目”里选择谱面类型、专辑与曲绘，
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
