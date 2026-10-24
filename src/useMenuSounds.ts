import { useCallback, useEffect, useRef, useState } from 'react';
import mode from './assets/menu-sfx/mode.wav';
import album from './assets/menu-sfx/album.wav';
import song from './assets/menu-sfx/song.wav';
import settings from './assets/menu-sfx/settings.wav';
import back from './assets/menu-sfx/back.wav';
import charge from './assets/menu-sfx/charge.wav';
import charged from './assets/menu-sfx/charged.wav';
import release from './assets/menu-sfx/release.wav';
import liquid from './assets/menu-sfx/liquid.wav';
import insert from './assets/menu-sfx/insert.wav';
import celebrate from './assets/menu-sfx/celebrate.wav';
import shutter from './assets/menu-sfx/shutter.wav';
import paper from './assets/menu-sfx/paper.wav';
import keyDown from './assets/menu-sfx/key-down.wav';
import keyLock from './assets/menu-sfx/key-lock.wav';
import keyUp from './assets/menu-sfx/key-up.wav';

const sources = {
  mode,
  album,
  song,
  settings,
  back,
  charge,
  charged,
  release,
  liquid,
  insert,
  celebrate,
  shutter,
  paper,
  'key-down': keyDown,
  'key-lock': keyLock,
  'key-up': keyUp,
};
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
  const current = useRef<{
    ui: HTMLAudioElement | null;
    liquid: HTMLAudioElement | null;
    celebration: HTMLAudioElement | null;
    shutter: HTMLAudioElement | null;
    paper: HTMLAudioElement | null;
  }>({
    ui: null,
    liquid: null,
    celebration: null,
    shutter: null,
    paper: null,
  });
  const playback = useRef({ ui: 0, liquid: 0, celebration: 0, shutter: 0, paper: 0 });
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
      // Water is a quiet transition bed; it must not interrupt the triggering UI click.
      const channel =
        name === 'liquid'
          ? 'liquid'
          : name === 'celebrate'
            ? 'celebration'
            : name === 'shutter'
              ? 'shutter'
              : name === 'paper' || name.startsWith('key-')
                ? 'paper'
                : 'ui';
      current.current[channel]?.pause();
      const token = ++playback.current[channel];
      if (volume === 0) return;
      const audio = sounds[name];
      current.current[channel] = audio;
      audio.volume = volume * (name === 'paper' ? 0.24 : name.startsWith('key-') ? 0.55 : 1);
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* A missing UI sound must not block navigation. */
      });
      return () => {
        if (playback.current[channel] === token) audio.pause();
      };
    },
    [sounds, volume],
  );
}
