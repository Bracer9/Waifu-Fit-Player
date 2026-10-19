import { useCallback, useEffect, useRef, useState } from 'react';
import mode from './assets/menu-sfx/mode.wav';
import album from './assets/menu-sfx/album.wav';
import song from './assets/menu-sfx/song.wav';
import settings from './assets/menu-sfx/settings.wav';
import back from './assets/menu-sfx/back.wav';
import charge from './assets/menu-sfx/charge.wav';
import charged from './assets/menu-sfx/charged.wav';

const sources = { mode, album, song, settings, back, charge, charged };
type MenuSound = keyof typeof sources;
export type MenuSoundPlayer = (name: MenuSound) => void | (() => void);

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
  const playback = useRef(0);
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
      const token = ++playback.current;
      if (volume === 0) return;
      const audio = sounds[name];
      current.current = audio;
      audio.volume = volume;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* A missing UI sound must not block navigation. */
      });
      return () => {
        if (playback.current === token) audio.pause();
      };
    },
    [sounds, volume],
  );
}
