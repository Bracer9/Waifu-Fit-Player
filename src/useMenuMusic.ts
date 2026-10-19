import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveVideo } from './local-media';
import { audioOutputErrorMessage } from './media';

const files = import.meta.glob<string>('./assets/menu-bgm/*.{mp3,ogg,wav,m4a,MP3,OGG,WAV,M4A}', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const themeTracks = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => {
    const id = path.split('/').at(-1)!;
    return { id, title: id.replace(/\.[^.]+$/, ''), url };
  });
export type MusicOrder = 'list' | 'random' | 'repeat';
type Scene = 'theme' | 'preview' | null;
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session settings still work. */
  }
}

export function useMenuMusic(
  scene: Scene,
  previewAsset: string | undefined,
  notify: (s: string) => void,
  videoVolume: number,
) {
  // Keep theme and preview independent. Only one element plays at a time.
  const [bgm] = useState(() => new Audio());
  const [preview] = useState(() => new Audio());
  const transport = useMemo(
    () => ({
      position: () => ({
        time: bgm.currentTime,
        duration: Number.isFinite(bgm.duration) ? bgm.duration : 0,
      }),
      subscribe: (update: () => void) => {
        const events = ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied', 'seeked'];
        events.forEach((event) => bgm.addEventListener(event, update));
        return () => events.forEach((event) => bgm.removeEventListener(event, update));
      },
      seek: (time: number) => {
        if (Number.isFinite(bgm.duration) && bgm.duration > 0)
          bgm.currentTime = Math.max(0, Math.min(bgm.duration, time));
      },
    }),
    [bgm],
  );
  const [selected, setSelected] = useState(() => preference('waifu-menu-track', ''));
  const [order, setOrder] = useState<MusicOrder>(() => {
    const saved = preference('waifu-menu-order', 'list');
    return saved === 'random' || saved === 'repeat' ? saved : 'list';
  });
  const [volume, setVolume] = useState(() =>
    Math.max(0, Math.min(1, Number(preference('waifu-menu-volume', '0.9')) || 0)),
  );
  const unmutedVolume = useRef(volume || 0.9);
  useEffect(() => {
    if (volume > 0) unmutedVolume.current = volume;
  }, [volume]);
  const [playing, setPlaying] = useState(false);
  const [quiet, setQuiet] = useState(true);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const graph = useRef<{ context: AudioContext; sources: MediaElementAudioSourceNode[] } | null>(
    null,
  );
  const active = useRef<HTMLAudioElement | null>(null);
  const manuallyPaused = useRef(false);
  const previewUrl = useRef<string | undefined>(undefined);
  const themeSource = useRef<{ url: string; objectUrl: string } | null>(null);
  const levels = useRef({ volume, videoVolume });
  levels.current = { volume, videoVolume };
  const gain = useRef(0);
  const fadeIn = useRef(false);
  const fading = useRef<{ frame: number; finish: (done: boolean) => void } | null>(null);
  const track = themeTracks.find((t) => t.id === selected) ?? themeTracks[0];
  const themeUrl = scene === 'theme' ? track?.url : undefined;
  const assetId = scene === 'preview' ? previewAsset : undefined;

  const cancelFade = useCallback(() => {
    if (!fading.current) return;
    cancelAnimationFrame(fading.current.frame);
    fading.current.finish(false);
    fading.current = null;
  }, []);
  const fade = useCallback(
    (target: number, duration: number): Promise<boolean> => {
      cancelFade();
      const audio = active.current;
      if (!audio || audio.paused || gain.current === target) {
        gain.current = target;
        return Promise.resolve(true);
      }
      const from = gain.current,
        start = performance.now();
      return new Promise((finish) => {
        const tick = (now: number) => {
          const progress = Math.max(0, Math.min(1, (now - start) / duration));
          gain.current = from + (target - from) * progress;
          audio.volume =
            gain.current * (audio === bgm ? levels.current.volume : levels.current.videoVolume);
          if (progress < 1) fading.current = { frame: requestAnimationFrame(tick), finish };
          else {
            fading.current = null;
            finish(true);
          }
        };
        fading.current = { frame: requestAnimationFrame(tick), finish };
      });
    },
    [bgm, cancelFade],
  );
  const clearPreview = useCallback(() => {
    preview.pause();
    if (preview.hasAttribute('src')) {
      preview.removeAttribute('src');
      preview.load();
    }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = undefined;
  }, [preview]);
  const play = useCallback(() => {
    const audio = active.current;
    if (!audio?.getAttribute('src') || (audio === bgm && manuallyPaused.current)) return;
    if (graph.current?.context.state === 'suspended')
      void graph.current.context.resume().catch(() => {});
    if (audio.paused)
      void audio.play().catch(() => {
        /* Wait for a user gesture if autoplay is blocked. */
      });
  }, [bgm]);

  useEffect(() => {
    const unlock = () => {
      if (active.current === bgm && manuallyPaused.current) return;
      if (!graph.current && active.current?.getAttribute('src')) {
        const context = new AudioContext();
        try {
          const meter = context.createAnalyser();
          meter.fftSize = 2048;
          meter.maxDecibels = -10;
          meter.smoothingTimeConstant = 0.5;
          // Both menu sources share one meter/output; the fade keeps playback exclusive.
          const sources = [bgm, preview].map((audio) => {
            const source = context.createMediaElementSource(audio);
            source.connect(meter);
            return source;
          });
          meter.connect(context.destination);
          graph.current = { context, sources };
          setAnalyser(meter);
        } catch {
          void context.close();
        }
      }
      play();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    bgm.addEventListener('playing', unlock);
    preview.addEventListener('playing', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      bgm.removeEventListener('playing', unlock);
      preview.removeEventListener('playing', unlock);
    };
  }, [bgm, preview, play]);

  useEffect(() => {
    const update = () => {
      const audio = active.current;
      setPlaying(!!audio && !audio.paused && !audio.ended && audio.readyState >= 3);
    };
    const startFade = (event: Event) => {
      if (event.target === active.current && fadeIn.current) {
        fadeIn.current = false;
        void fade(1, 240);
      }
      update();
    };
    const error = (event: Event) => {
      const audio = event.target as HTMLAudioElement;
      if (audio === active.current)
        notify(audioOutputErrorMessage(audio.error) || '音乐无法播放，请检查音频或关联视频。');
    };
    const events = ['pause', 'waiting', 'ended'];
    for (const audio of [bgm, preview]) {
      events.forEach((name) => audio.addEventListener(name, update));
      audio.addEventListener('playing', startFade);
      audio.addEventListener('error', error);
    }
    return () => {
      for (const audio of [bgm, preview]) {
        events.forEach((name) => audio.removeEventListener(name, update));
        audio.removeEventListener('playing', startFade);
        audio.removeEventListener('error', error);
      }
    };
  }, [bgm, preview, fade, notify]);

  useEffect(() => {
    let cancelled = false;
    const request = new AbortController();
    fadeIn.current = false;
    void (async () => {
      if (!(await fade(0, 160)) || cancelled) return;
      active.current?.pause();
      active.current = null;
      clearPreview();
      if (!themeUrl && !assetId && graph.current)
        await graph.current.context.suspend().catch(() => {});
      if (cancelled) return;
      setQuiet(true);
      let next: HTMLAudioElement;
      if (themeUrl) {
        next = bgm;
        if (themeSource.current?.url !== themeUrl) {
          try {
            // Chromium may discard its HTTP media buffer during a long pause.
            // Retain only this track's compressed file so resume needs no range request.
            const response = await fetch(themeUrl, {
              signal: request.signal,
              headers: { Range: 'bytes=0-' },
            });
            if (!response.ok) throw new Error(`BGM HTTP ${response.status}`);
            const file = await response.blob();
            if (!file.size) throw new Error('Empty BGM response');
            if (cancelled) return;
            const previous = themeSource.current;
            const objectUrl = URL.createObjectURL(file);
            themeSource.current = { url: themeUrl, objectUrl };
            bgm.src = objectUrl;
            if (previous) URL.revokeObjectURL(previous.objectUrl);
          } catch {
            if (!cancelled) notify('菜单音乐加载失败，请检查音乐文件。');
            return;
          }
        }
      } else if (assetId) {
        // The fade also lets fast carousel scrolling settle before reading a video.
        const result = await resolveVideo(assetId).catch(() => null);
        if (cancelled || !result || !('asset' in result)) return;
        next = preview;
        const { asset } = result;
        preview.src =
          asset.kind === 'demo'
            ? asset.url
            : (previewUrl.current = URL.createObjectURL(asset.file));
        preview.loop = true;
      } else return;
      next.volume = 0;
      active.current = next;
      fadeIn.current = true;
      setQuiet(false);
      play();
    })();
    return () => {
      cancelled = true;
      request.abort();
      cancelFade();
    };
  }, [scene, themeUrl, assetId, bgm, preview, fade, clearPreview, cancelFade, play, notify]);

  useEffect(() => {
    bgm.loop = order === 'repeat' || themeTracks.length < 2;
    const next = () => {
      if (scene !== 'theme' || !track) return;
      const index = themeTracks.indexOf(track);
      const advance =
        order === 'random' ? 1 + Math.floor(Math.random() * (themeTracks.length - 1)) : 1;
      setSelected(themeTracks[(index + advance) % themeTracks.length].id);
    };
    bgm.addEventListener('ended', next);
    return () => bgm.removeEventListener('ended', next);
  }, [scene, order, track, bgm]);
  useEffect(() => {
    bgm.volume = (active.current === bgm ? gain.current : 0) * volume;
    preview.volume = (active.current === preview ? gain.current : 0) * videoVolume;
    remember('waifu-menu-volume', String(volume));
  }, [volume, videoVolume, bgm, preview]);
  useEffect(() => remember('waifu-menu-order', order), [order]);
  useEffect(() => remember('waifu-menu-track', selected), [selected]);
  useEffect(
    () => () => {
      cancelFade();
      clearPreview();
      bgm.pause();
      bgm.removeAttribute('src');
      bgm.load();
      if (themeSource.current) URL.revokeObjectURL(themeSource.current.objectUrl);
      themeSource.current = null;
      graph.current?.sources.forEach((source) => source.disconnect());
      void graph.current?.context.close();
    },
    [bgm, clearPreview, cancelFade],
  );
  return {
    transport,
    tracks: themeTracks,
    track,
    order,
    setOrder,
    volume,
    setVolume,
    toggleMute: () => {
      if (volume > 0) {
        unmutedVolume.current = volume;
        setVolume(0);
      } else setVolume(unmutedVolume.current);
    },
    select: (id: string) => {
      if (id !== track?.id) manuallyPaused.current = false;
      setSelected(id);
    },
    toggle: () => {
      if (active.current !== bgm) return;
      manuallyPaused.current = !bgm.paused;
      if (manuallyPaused.current) {
        bgm.pause();
        void graph.current?.context.suspend().catch(() => {});
      } else play();
    },
    playing,
    visualVolume: scene === 'preview' ? videoVolume : volume,
    analyser,
    quiet,
  };
}
export type MenuMusic = ReturnType<typeof useMenuMusic>;
