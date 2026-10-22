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
import type { GameplayFrameRate } from '../media';

const FRAME_RATES = [60, 120, 'display'] as const;

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
  const restoreKey = `waifu-fit-player-${id}-restore-volume`;
  const [restoreVolume, setRestoreVolume] = useState(() => {
    if (value > 0) return value;
    try {
      const saved = Number(localStorage.getItem(restoreKey));
      if (saved > 0 && saved <= 1) return saved;
    } catch {
      // Use a moderate volume if this channel has never been audible here.
    }
    return 0.5;
  });
  useEffect(() => {
    if (value <= 0) return;
    setRestoreVolume(value);
    try {
      localStorage.setItem(restoreKey, String(value));
    } catch {
      // The toggle still remembers the volume for this mounted session.
    }
  }, [value, restoreKey]);
  const muted = value === 0;
  const toggleLabel = muted ? `恢复${label}` : `静音${label}`;
  return (
    <div className="corner-settings-row" data-muted={muted ? '' : undefined}>
      <button
        type="button"
        className="settings-row-icon settings-mute"
        aria-label={toggleLabel}
        aria-pressed={muted}
        aria-controls={id}
        title={muted ? `${toggleLabel}（${Math.round(restoreVolume * 100)}%）` : toggleLabel}
        onClick={() => onChange(muted ? restoreVolume : 0)}
      >
        <Icon size={27} aria-hidden="true" />
      </button>
      <div className="settings-row-content">
        <div className="settings-row-heading">
          <label htmlFor={id}>{name}</label>
          <output htmlFor={id} className={muted ? 'settings-muted-label' : undefined}>
            {muted ? 'MUTED' : `${Math.round(value * 100)}%`}
          </output>
        </div>
        <input
          id={id}
          className="music-range"
          aria-label={label}
          aria-valuetext={muted ? '静音' : `${Math.round(value * 100)}%`}
          aria-description="左右调整音量，Enter 静音或恢复，上下切换设置项。"
          title="左右调整音量 · Enter 静音／恢复"
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
  gameplayFrameRate,
  onGameplayFrameRate,
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
  gameplayFrameRate: GameplayFrameRate;
  onGameplayFrameRate: (rate: GameplayFrameRate) => void;
}) {
  const [tab, setTab] = useState<'audio' | 'system'>('audio');
  const root = useRef<HTMLElement>(null);
  const selected = useRef<HTMLElement | null>(null);
  const pointer = useRef({ x: -1, y: -1 });
  const clearSelection = () => {
    selected.current?.removeAttribute('data-settings-highlighted');
    selected.current?.removeAttribute('data-adjusting');
    selected.current = null;
  };
  const select = (node: HTMLElement, adjusting = true) => {
    if (selected.current === node) return;
    clearSelection();
    selected.current = node;
    node.setAttribute('data-settings-highlighted', '');
    if (node instanceof HTMLInputElement) node.toggleAttribute('data-adjusting', adjusting);
  };
  const focus = (node: HTMLElement | null | undefined) => {
    if (!node) return;
    if (node === trigger.current) clearSelection();
    else select(node);
    if (document.activeElement !== node) {
      onSound('settings');
      node.focus({ preventScroll: true });
    }
  };
  useEffect(() => {
    if (!open) clearSelection();
  }, [open]);
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
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        select(target.closest<HTMLElement>('[role="radiogroup"]') ?? target);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) clearSelection();
      }}
      onPointerMoveCapture={(event) => {
        if (pointer.current.x === event.clientX && pointer.current.y === event.clientY) return;
        pointer.current = { x: event.clientX, y: event.clientY };
        const target = event.target as HTMLElement;
        const node =
          target.closest<HTMLElement>(
            '[role="tab"], .settings-mute, input[type="range"], [role="radiogroup"]',
          ) ?? target.closest('.corner-settings-row')?.querySelector<HTMLInputElement>('input');
        if (!node) return;
        select(node, false);
        node.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        const element = event.target as HTMLElement;
        const target = element.closest<HTMLElement>('[role="radiogroup"]') ?? element;
        const activeTab = root.current?.querySelector<HTMLElement>(
          '[role="tab"][aria-selected="true"]',
        );
        const ranges = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            '.corner-settings-pane:not([hidden]) :is(input, [role="radiogroup"])',
          ) ?? [],
        );
        if (target.matches('[role="tab"]')) {
          if (event.key === 'ArrowUp') focus(trigger.current);
          else if (event.key === 'ArrowDown' || (event.key === 'Enter' && !event.repeat))
            focus(ranges[0]);
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            focus(
              root.current?.querySelector<HTMLElement>(
                `#menu-settings-tab-${tab === 'audio' ? 'system' : 'audio'}`,
              ),
            );
          }
          return;
        }
        const frameRate = target.matches('[role="radiogroup"]');
        if (target.matches('.settings-mute')) {
          if (event.key === 'Enter') {
            if (!event.repeat) target.click();
          } else {
            const input = target.closest('.corner-settings-row')?.querySelector('input');
            const index = ranges.indexOf(input!);
            if (event.key === 'ArrowUp') focus(index > 0 ? ranges[index - 1] : activeTab);
            else if (event.key === 'ArrowDown')
              focus(ranges[Math.min(ranges.length - 1, index + 1)]);
            else focus(input);
          }
          return;
        }
        if (!(target instanceof HTMLInputElement) && !frameRate) return;
        if (event.key === 'Enter') {
          if (!event.repeat) {
            if (target instanceof HTMLInputElement) {
              if (target.id === 'menu-note-speed') target.toggleAttribute('data-adjusting');
              else
                target
                  .closest('.corner-settings-row')
                  ?.querySelector<HTMLButtonElement>('.settings-mute')
                  ?.click();
            }
            onSound('settings');
          }
          return;
        }
        const index = ranges.indexOf(target);
        if (event.key === 'ArrowUp') focus(index > 0 ? ranges[index - 1] : activeTab);
        else if (event.key === 'ArrowDown') focus(ranges[Math.min(ranges.length - 1, index + 1)]);
        else if (frameRate) {
          const index = FRAME_RATES.indexOf(gameplayFrameRate);
          const next =
            FRAME_RATES[Math.max(0, Math.min(2, index + (event.key === 'ArrowRight' ? 1 : -1)))];
          if (next !== gameplayFrameRate) {
            onGameplayFrameRate(next);
            onSound('settings');
          }
        } else if (target instanceof HTMLInputElement) {
          target.setAttribute('data-adjusting', '');
          const speed = target.id === 'menu-note-speed';
          const change = speed
            ? onNoteSpeed
            : target.id === 'settings-menu-volume'
              ? onMenuVolume
              : target.id === 'settings-video-volume'
                ? onVideoVolume
                : onSeVolume;
          const value = speed
            ? noteSpeed
            : target.id === 'settings-menu-volume'
              ? menuVolume
              : target.id === 'settings-video-volume'
                ? videoVolume
                : seVolume;
          const delta = (event.key === 'ArrowRight' ? 1 : -1) * (speed ? 0.5 : 0.05);
          const next = Math.max(
            Number(target.min),
            Math.min(Number(target.max), Math.round((value + delta) * 100) / 100),
          );
          if (next !== value) {
            change(next);
            onSound('settings');
          }
        }
      }}
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
            onFocus={() => setTab(id)}
            onClick={() => {
              setTab(id);
              onSound('settings');
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
                aria-description="左右每次调整 0.5，Enter 确认，上下切换设置项。"
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
          <div className="corner-settings-row">
            <Monitor className="settings-row-icon" size={27} aria-hidden="true" />
            <div className="settings-row-content">
              <div className="settings-row-heading">
                <span>GAMEPLAY FPS</span>
              </div>
              <div
                className="settings-frame-rates"
                role="radiogroup"
                aria-label="游玩帧率"
                aria-describedby="settings-frame-rate-hint"
                aria-description="左右选择，Enter 确认，上下切换设置项。"
                tabIndex={0}
              >
                {FRAME_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    role="radio"
                    aria-checked={gameplayFrameRate === rate}
                    tabIndex={-1}
                    onClick={(event) => {
                      onGameplayFrameRate(rate);
                      onSound('settings');
                      event.currentTarget.parentElement?.focus({ preventScroll: true });
                    }}
                  >
                    {rate === 'display' ? '跟随显示器' : `${rate} FPS`}
                  </button>
                ))}
              </div>
              <p className="settings-frame-hint" id="settings-frame-rate-hint">
                仅调整游玩音符的更新频率，高帧率负载更高。
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
