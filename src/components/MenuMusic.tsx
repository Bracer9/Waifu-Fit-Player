import { useEffect, useRef, useState } from 'react';
import { changeLibrary, readLibrary, type MenuMusic } from '../library';

export function useMenuMusic(scene: MenuMusic['id'] | null, notify: (s: string) => void) {
  const [tracks, setTracks] = useState<MenuMusic[]>([]);
  const [volume, setVolume] = useState(() => {
    try {
      const v = localStorage.getItem('waifu-menu-volume');
      return v === null ? 0.35 : Math.max(0, Math.min(1, Number(v) || 0));
    } catch {
      return 0.35;
    }
  });
  const audio = useRef<HTMLAudioElement | null>(null);
  const track = tracks.find((t) => t.id === scene);
  useEffect(() => {
    void readLibrary('music')
      .then(setTracks)
      .catch(() => notify('菜单音乐设置未能读取。'));
  }, [notify]);
  useEffect(() => {
    if (!track) return;
    const url = URL.createObjectURL(track.file);
    const element = new Audio(url);
    audio.current = element;
    element.loop = true;
    element.volume = volume;
    const start = () => {
      if (element.paused) void element.play().catch(() => {});
    };
    element.onerror = () => notify('这首菜单音乐无法播放，请在设置里换一个音频文件。');
    start();
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      element.pause();
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      audio.current = null;
    };
    // Volume changes update the existing element without restarting the track.
  }, [scene, track, notify]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    try {
      localStorage.setItem('waifu-menu-volume', String(volume));
    } catch {
      /* Session volume still works. */
    }
  }, [volume]);
  const select = async (id: MenuMusic['id'], file?: File) => {
    try {
      await changeLibrary('music', id, () => (file ? { id, file } : undefined));
      setTracks((old) => [...old.filter((t) => t.id !== id), ...(file ? [{ id, file }] : [])]);
    } catch {
      notify('菜单音乐未能保存，请检查本地存储空间。');
    }
  };
  return { tracks, volume, setVolume, select };
}

export function MenuMusicSettings({ music }: { music: ReturnType<typeof useMenuMusic> }) {
  return (
    <div className="menu-music-settings">
      <h3>菜单背景音乐</h3>
      {(['home', 'library'] as const).map((id) => (
        <div className="music-file-setting" key={id}>
          <div>
            <strong>{id === 'home' ? '主菜单' : '选专辑 / 选曲'}</strong>
            <small>{music.tracks.find((t) => t.id === id)?.file.name ?? '未选择音乐'}</small>
          </div>
          <label className="button light small">
            选择
            <input
              hidden
              type="file"
              accept="audio/*,.mp3,.ogg,.wav,.m4a"
              aria-label={id === 'home' ? '主菜单背景音乐' : '选曲背景音乐'}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) void music.select(id, f);
              }}
            />
          </label>
          {music.tracks.some((t) => t.id === id) && (
            <button
              aria-label={`移除${id === 'home' ? '主菜单' : '选曲'}背景音乐`}
              onClick={() => void music.select(id)}
            >
              移除
            </button>
          )}
        </div>
      ))}
      <label className="field">
        <span>菜单音乐音量 · {Math.round(music.volume * 100)}%</span>
        <input
          aria-label="菜单音乐音量"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={music.volume}
          onChange={(e) => music.setVolume(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
