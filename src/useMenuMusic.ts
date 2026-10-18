import { useCallback, useEffect, useRef, useState } from 'react';
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
) {
  const [audio] = useState(() => new Audio());
  const [selected, setSelected] = useState(() => preference('waifu-menu-track', ''));
  const [order, setOrder] = useState<MusicOrder>(() => {
    const saved = preference('waifu-menu-order', 'list');
    return saved === 'random' || saved === 'repeat' ? saved : 'list';
  });
  const [volume, setVolume] = useState(() =>
    Math.max(0, Math.min(1, Number(preference('waifu-menu-volume', '0.35')) || 0)),
  );
  const [playing, setPlaying] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const graph = useRef<{ context: AudioContext; source: MediaElementAudioSourceNode } | null>(null);
  const resumeTheme = useRef({ url: '', time: 0 });
  const track = themeTracks.find((t) => t.id === selected) ?? themeTracks[0];
  const themeUrl = scene === 'theme' ? track?.url : undefined;
  const assetId = scene === 'preview' ? previewAsset : undefined;

  const play = useCallback(() => {
    if (!audio.getAttribute('src')) return;
    if (graph.current?.context.state === 'suspended')
      void graph.current.context.resume().catch(() => {});
    void audio.play().catch(() => {
      /* Autoplay can wait for the next user gesture. */
    });
  }, [audio]);

  // The analyser belongs only to menu audio. Gameplay keeps its original media path.
  useEffect(() => {
    const unlock = () => {
      if (!scene || !audio.getAttribute('src')) return;
      if (!graph.current && scene === 'theme') {
        try {
          const context = new AudioContext();
          const source = context.createMediaElementSource(audio);
          const meter = context.createAnalyser();
          meter.fftSize = 512;
          meter.smoothingTimeConstant = 0.8;
          source.connect(meter);
          meter.connect(context.destination);
          graph.current = { context, source };
          setAnalyser(meter);
        } catch {
          /* Audio can still play when visualisation is unavailable. */
        }
      }
      play();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    audio.addEventListener('playing', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      audio.removeEventListener('playing', unlock);
    };
  }, [scene, audio, play]);

  useEffect(() => {
    const update = () => setPlaying(!audio.paused && !audio.ended && audio.readyState >= 3);
    const error = () =>
      notify(audioOutputErrorMessage(audio.error) || '菜单音乐无法播放，请检查音频或关联视频。');
    const events = ['playing', 'pause', 'waiting', 'ended'];
    events.forEach((name) => audio.addEventListener(name, update));
    audio.addEventListener('error', error);
    return () => {
      events.forEach((name) => audio.removeEventListener(name, update));
      audio.removeEventListener('error', error);
    };
  }, [audio, notify]);

  useEffect(() => {
    let cancelled = false;
    let ownedUrl: string | undefined;
    const load = (url: string, time = 0) => {
      audio.src = url;
      audio.currentTime = time;
      play();
    };
    if (themeUrl)
      load(themeUrl, resumeTheme.current.url === themeUrl ? resumeTheme.current.time : 0);
    // Wait briefly for the carousel to settle; stale resolutions never play.
    const timer = assetId
      ? setTimeout(() => {
          void resolveVideo(assetId)
            .then((result) => {
              if (cancelled || !('asset' in result)) return;
              const { asset } = result;
              const url =
                asset.kind === 'demo' ? asset.url : (ownedUrl = URL.createObjectURL(asset.file));
              load(url);
            })
            .catch(() => {
              /* Missing access is handled by the existing Start flow. */
            });
        }, 180)
      : undefined;
    if (!scene && graph.current) void graph.current.context.suspend().catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (themeUrl) resumeTheme.current = { url: themeUrl, time: audio.currentTime };
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [scene, themeUrl, assetId, audio, play]);

  useEffect(() => {
    audio.loop = scene === 'preview' || order === 'repeat' || themeTracks.length < 2;
    const next = () => {
      if (scene !== 'theme' || !track) return;
      const index = themeTracks.indexOf(track);
      const advance =
        order === 'random' ? 1 + Math.floor(Math.random() * (themeTracks.length - 1)) : 1;
      setSelected(themeTracks[(index + advance) % themeTracks.length].id);
    };
    audio.addEventListener('ended', next);
    return () => audio.removeEventListener('ended', next);
  }, [scene, order, track, audio]);
  useEffect(() => {
    audio.volume = volume;
    remember('waifu-menu-volume', String(volume));
  }, [volume, audio]);
  useEffect(() => remember('waifu-menu-order', order), [order]);
  useEffect(() => remember('waifu-menu-track', selected), [selected]);
  useEffect(
    () => () => {
      graph.current?.source.disconnect();
      void graph.current?.context.close();
    },
    [],
  );

  return {
    tracks: themeTracks,
    track,
    order,
    setOrder,
    volume,
    setVolume,
    select: setSelected,
    playing,
    analyser,
  };
}
export type MenuMusic = ReturnType<typeof useMenuMusic>;
