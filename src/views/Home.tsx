import { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowUpRight, Disc3, PencilLine } from 'lucide-react';
import { MenuMusicConsole } from '../components/MenuMusic';
import { MainMenuDownHint } from '../components/MainMenuDownHint';
import { MenuControls } from '../components/MenuControls';
import { CoverTrace } from '../components/CoverTrace';
import { useCardHighlight } from '../useCardHighlight';
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
  const { activate, getCurrent, handlers } = useCardHighlight();
  const lastMode = useRef(0);
  useLayoutEffect(() => {
    const play = records.current?.querySelector<HTMLButtonElement>('.play-mode') ?? null;
    activate(play);
    play?.focus({ preventScroll: true });
  }, [activate]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const current = getCurrent();
      const gear = document.querySelector<HTMLButtonElement>('.menu-settings');
      const headphone = document.querySelector<HTMLButtonElement>('.headphone-button');
      if (
        event.defaultPrevented ||
        document.querySelector('.menu-curtain') ||
        (document.querySelector('[role="dialog"]') && current !== gear) ||
        target.closest('.corner-settings, .music-panel') ||
        /INPUT|SELECT|TEXTAREA/.test(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (
        current === gear &&
        document.querySelector('.corner-settings[data-open]') &&
        event.key.startsWith('Arrow')
      ) {
        event.preventDefault();
        if (event.key === 'ArrowDown')
          document
            .querySelector<HTMLButtonElement>('.corner-settings [role="tab"][aria-selected="true"]')
            ?.focus();
        return;
      }
      const modes = Array.from(records.current?.querySelectorAll('button') ?? []);
      const buttons = [...modes, gear].filter((button): button is HTMLButtonElement => !!button);
      const index = Math.max(0, buttons.indexOf(current as HTMLButtonElement));
      if (current === modes[0] || current === modes[1])
        lastMode.current = modes.indexOf(current as HTMLButtonElement);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        let next: HTMLButtonElement | null = current as HTMLButtonElement | null;
        if (event.key === 'ArrowRight')
          next = current === headphone ? gear : buttons[Math.min(buttons.length - 1, index + 1)];
        if (event.key === 'ArrowLeft')
          next = current === headphone ? modes[lastMode.current] : buttons[Math.max(0, index - 1)];
        if (event.key === 'ArrowDown') next = current === gear ? modes[1] : headphone;
        if (event.key === 'ArrowUp') next = current === headphone ? modes[lastMode.current] : gear;
        activate(next);
        if (next && document.activeElement !== next) {
          onSound('settings');
          next.focus({ preventScroll: true });
        }
      } else if (event.key === 'Enter' && (current || target.tagName !== 'BUTTON')) {
        event.preventDefault();
        if (!event.repeat) ((current as HTMLButtonElement | null) ?? modes[0])?.click();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onSound, activate, getCurrent]);
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
      <div className="mode-records" ref={records} {...handlers}>
        <button className="mode-record play-mode" onClick={onPlay}>
          <span className="mode-record-face">
            <span className="record-number">01 / PLAY</span>
            <Disc3 className="mode-symbol" strokeWidth={1.5} />
            <span className="mode-label">
              <strong>音游模式</strong>
              <small>LET'S MOVE</small>
              <ArrowUpRight />
            </span>
            <CoverTrace />
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
            <CoverTrace />
          </span>
        </button>
      </div>
      <MenuMusicConsole music={music} onSound={onSound}>
        <MainMenuDownHint />
      </MenuMusicConsole>
      <MenuControls />
    </section>
  );
}
