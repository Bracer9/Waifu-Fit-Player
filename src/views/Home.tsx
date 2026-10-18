import { useEffect, useRef } from 'react';
import { ArrowUpRight, Disc3, PencilLine } from 'lucide-react';
import { MenuMusicConsole } from '../components/MenuMusic';
import { MenuControls } from '../components/MenuControls';
import type { MenuMusic } from '../useMenuMusic';
import type { MenuSoundPlayer } from '../useMenuSounds';

export function Home({
  onPlay,
  onCreate,
  music,
  onSound,
}: {
  onPlay: () => void;
  onCreate: () => void;
  music: MenuMusic;
  onSound: MenuSoundPlayer;
}) {
  const records = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        document.querySelector('.menu-curtain, [role="dialog"]') ||
        /INPUT|SELECT|TEXTAREA/.test(target.tagName) ||
        target.isContentEditable
      )
        return;
      const buttons = Array.from(records.current?.querySelectorAll('button') ?? []);
      const index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const next = Math.max(
          0,
          Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
        );
        if (document.activeElement !== buttons[next]) {
          onSound('settings');
          buttons[next]?.focus({ preventScroll: true });
        }
      } else if (event.key === 'Enter' && target.tagName !== 'BUTTON') {
        event.preventDefault();
        buttons[index]?.click();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onSound]);
  return (
    <section className="title-menu" aria-label="主菜单">
      <div className="title-brand">
        <span className="eyebrow">YOUR MUSIC. YOUR MOVEMENT.</span>
        <h1>
          WAIFU <b>FIT</b>
          <br />
          PLAYER<span>↗</span>
        </h1>
      </div>
      <div className="mode-records" ref={records}>
        <button className="mode-record play-mode" onClick={onPlay}>
          <span className="mode-record-face">
            <span className="record-number">01 / PLAY</span>
            <Disc3 className="mode-symbol" strokeWidth={1.5} />
            <span className="mode-label">
              <strong>音游模式</strong>
              <small>LET'S MOVE</small>
              <ArrowUpRight />
            </span>
          </span>
        </button>
        <button className="mode-record create-mode" onClick={onCreate}>
          <span className="mode-record-face">
            <span className="record-number">02 / CREATE</span>
            <PencilLine className="mode-symbol" strokeWidth={1.5} />
            <span className="mode-label">
              <strong>创作模式</strong>
              <small>MAKE YOUR RHYTHM</small>
              <ArrowUpRight />
            </span>
          </span>
        </button>
      </div>
      <MenuMusicConsole music={music} onSound={onSound} />
      <MenuControls />
    </section>
  );
}
