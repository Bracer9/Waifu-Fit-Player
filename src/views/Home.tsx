import { ArrowUpRight, Disc3, PencilLine } from 'lucide-react';
import { MenuMusicConsole } from '../components/MenuMusic';
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
      <div className="mode-records">
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
    </section>
  );
}
