import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AudioLines,
  Gauge,
  Monitor,
  Music2,
  Sparkles,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { MenuSoundPlayer } from '../useMenuSounds';

export function SettingsGearHalo() {
  return (
    <span className="settings-gear-halo" aria-hidden="true">
      <svg viewBox="0 0 136 136" focusable="false">
        <circle cx="68" cy="68" r="55" pathLength="100" />
        <path d="M119 24 137 11M131 47 149 39M129 99 145 110M115 118 126 135" />
      </svg>
    </span>
  );
}

function SettingsVolume({
  id,
  name,
  label,
  value,
  onChange,
  Icon,
}: {
  id: string;
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  Icon: LucideIcon;
}) {
  return (
    <div className="corner-settings-row">
      <Icon className="settings-row-icon" size={27} aria-hidden="true" />
      <div className="settings-row-content">
        <div className="settings-row-heading">
          <label htmlFor={id}>{name}</label>
          <output htmlFor={id}>{Math.round(value * 100)}%</output>
        </div>
        <input
          id={id}
          className="music-range"
          aria-label={label}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          style={{ '--range-progress': `${value * 100}%` } as React.CSSProperties}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

export function MenuSettings({
  open,
  trigger,
  onClose,
  onSound,
  menuVolume,
  onMenuVolume,
  videoVolume,
  onVideoVolume,
  seVolume,
  onSeVolume,
  noteSpeed,
  onNoteSpeed,
}: {
  open: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSound: MenuSoundPlayer;
  menuVolume: number;
  onMenuVolume: (volume: number) => void;
  videoVolume: number;
  onVideoVolume: (volume: number) => void;
  seVolume: number;
  onSeVolume: (volume: number) => void;
  noteSpeed: number;
  onNoteSpeed: (speed: number) => void;
}) {
  const [tab, setTab] = useState<'audio' | 'system'>('audio');
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !trigger.current?.contains(target)) close.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keyboard, true);
    };
  }, [open, trigger]);
  return (
    <aside
      className="corner-settings"
      id="menu-settings-panel"
      ref={root}
      data-open={open ? '' : undefined}
      role={open ? 'dialog' : undefined}
      aria-label="全局设置"
      aria-modal={false}
      aria-hidden={!open}
      inert={!open}
    >
      <header className="corner-settings-heading">
        <h2>SETTINGS</h2>
        <p>TAILOR YOUR EXPERIENCE.</p>
      </header>
      <div className="corner-settings-tabs" role="tablist" aria-label="设置分类">
        {(
          [
            { id: 'audio', name: 'AUDIO', Icon: Volume2 },
            { id: 'system', name: 'SYSTEM', Icon: Monitor },
          ] as const
        ).map(({ id, name, Icon }) => (
          <button
            className="corner-settings-tab"
            id={`menu-settings-tab-${id}`}
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`menu-settings-${id}`}
            onPointerEnter={() => setTab(id)}
            onFocus={() => setTab(id)}
            onClick={() => {
              setTab(id);
              onSound('settings');
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                trigger.current?.focus({ preventScroll: true });
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                root.current
                  ?.querySelector<HTMLButtonElement>(
                    `#menu-settings-tab-${id === 'audio' ? 'system' : 'audio'}`,
                  )
                  ?.focus();
              }
            }}
          >
            <Icon size={25} aria-hidden="true" />
            {name}
          </button>
        ))}
      </div>
      <div className="corner-settings-sheet">
        <div className="settings-paper-art" aria-hidden="true">
          <svg viewBox="0 0 400 320" preserveAspectRatio="none">
            <path className="settings-paper-outline" d="M2 2H398V318H50L2 268Z" />
            <path className="settings-paper-seam" d="M2 240V267L50 318H104M5 259 53 309" />
          </svg>
          <i className="settings-paper-dots left" />
          <i className="settings-paper-dots right" />
        </div>
        <div
          className="corner-settings-pane"
          id="menu-settings-audio"
          role="tabpanel"
          aria-labelledby="menu-settings-tab-audio"
          hidden={tab !== 'audio'}
        >
          <SettingsVolume
            id="settings-menu-volume"
            name="MENU BGM"
            label="菜单 BGM 音量"
            value={menuVolume}
            onChange={onMenuVolume}
            Icon={Music2}
          />
          <SettingsVolume
            id="settings-video-volume"
            name="GAMEPLAY MUSIC"
            label="游戏／视频音量"
            value={videoVolume}
            onChange={onVideoVolume}
            Icon={AudioLines}
          />
          <SettingsVolume
            id="settings-se-volume"
            name="SFX"
            label="音效（SE）音量"
            value={seVolume}
            onChange={onSeVolume}
            Icon={Sparkles}
          />
        </div>
        <div
          className="corner-settings-pane system"
          id="menu-settings-system"
          role="tabpanel"
          aria-labelledby="menu-settings-tab-system"
          hidden={tab !== 'system'}
        >
          <div className="corner-settings-row">
            <Gauge className="settings-row-icon" size={27} aria-hidden="true" />
            <div className="settings-row-content">
              <div className="settings-row-heading">
                <label htmlFor="menu-note-speed">NOTE SPEED</label>
                <output htmlFor="menu-note-speed">{noteSpeed.toFixed(1)}</output>
              </div>
              <input
                id="menu-note-speed"
                className="music-range"
                aria-label="音符流速"
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={noteSpeed}
                style={
                  {
                    '--range-progress': `${((noteSpeed - 0.5) / 9.5) * 100}%`,
                  } as React.CSSProperties
                }
                onChange={(event) => onNoteSpeed(Number(event.target.value))}
              />
              <div className="settings-speed-scale" aria-hidden="true">
                <span>0.5 / SLOW</span>
                <span>10 / FAST</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
