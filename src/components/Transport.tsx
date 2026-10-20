import { Play, Pause, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { MediaController, useMediaStatus, useTime } from '../media';
import { formatTime } from '../timing';
import type { PlayRange } from '../model';
export function Transport({
  media,
  notify,
  playRange,
  onToggle,
  onRestart,
  disabled = false,
}: {
  media: MediaController;
  notify: (text: string) => void;
  playRange?: PlayRange;
  onToggle?: () => void;
  onRestart?: () => void;
  disabled?: boolean;
}) {
  const status = useMediaStatus(media),
    time = useTime(media);
  const start = playRange?.startMs ?? 0;
  const end = playRange?.endMs ?? status.durationMs;
  const duration = Math.max(0, end - start);
  const position = Math.max(start, Math.min(end, time));
  return (
    <div className="transport">
      <button
        className="icon-button"
        title="Restart"
        aria-label="Restart"
        disabled={disabled || !status.ready}
        onClick={onRestart ?? (() => media.seek(start))}
      >
        <SkipBack size={19} />
      </button>
      <button
        className="play-button"
        aria-label={status.playing ? 'Pause' : 'Play'}
        disabled={disabled || !status.ready || status.preparing}
        onClick={() =>
          onToggle
            ? onToggle()
            : media.toggle().catch(() => notify('Unable to start. Press Play to try again.'))
        }
      >
        {status.playing ? (
          <Pause size={22} fill="currentColor" />
        ) : (
          <Play size={22} fill="currentColor" />
        )}
      </button>
      <span className="time-readout" data-testid="current-time">
        {formatTime(position - start)}
      </span>
      <input
        className="seek"
        aria-label="Playback position"
        type="range"
        min={start}
        max={end || 1}
        step={1}
        value={position}
        disabled={disabled || !status.ready}
        style={
          {
            '--progress': `${duration ? ((position - start) / duration) * 100 : 0}%`,
          } as React.CSSProperties
        }
        onChange={(e) => media.seek(Number(e.target.value))}
      />
      <span className="time-readout total">{formatTime(duration)}</span>
      <button
        className="icon-button volume-toggle"
        aria-label={status.volume ? 'Mute' : 'Unmute'}
        onClick={() => media.setVolume(status.volume ? 0 : 0.7)}
      >
        {status.volume ? <Volume2 size={19} /> : <VolumeX size={19} />}
      </button>
      <input
        className="volume"
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={status.volume}
        onChange={(e) => media.setVolume(Number(e.target.value))}
      />
    </div>
  );
}
