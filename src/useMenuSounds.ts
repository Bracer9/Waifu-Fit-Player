import { useCallback, useEffect, useRef, useState } from 'react';
import mode from './assets/menu-sfx/mode.wav';
import album from './assets/menu-sfx/album.wav';
import song from './assets/menu-sfx/song.wav';
import settings from './assets/menu-sfx/settings.wav';
import back from './assets/menu-sfx/back.wav';

const sources = { mode, album, song, settings, back };
type MenuSound = keyof typeof sources;
export type MenuSoundPlayer = (name: MenuSound) => void;

export function useMenuSounds(volume: number) {
  const [sounds] = useState(
    () =>
      Object.fromEntries(
        Object.entries(sources).map(([name, src]) => {
          const audio = document.createElement('audio');
          audio.dataset.menuSound = name;
          audio.preload = 'auto';
          audio.src = src;
          return [name, audio];
        }),
      ) as Record<MenuSound, HTMLAudioElement>,
  );
  const current = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      Object.values(sounds).forEach((audio) => {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      });
    },
    [sounds],
  );
  return useCallback(
    (name: MenuSound) => {
      current.current?.pause();
      if (volume === 0) return;
      const audio = sounds[name];
      current.current = audio;
      audio.volume = volume * 0.45;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* A missing UI sound must not block navigation. */
      });
    },
    [sounds, volume],
  );
}
