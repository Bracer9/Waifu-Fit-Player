import { Play, Pause, SkipBack, Maximize, Volume2, VolumeX } from 'lucide-react';
import { MediaController, useMediaStatus, useTime } from '../media';
import { formatTime } from '../timing';
export function Transport({
  media,
  fullScreen,
  notify,
}: {
  media: MediaController;
  fullScreen: () => void;
  notify: (text: string) => void;
}) {
  const status = useMediaStatus(media),
    time = useTime(media);
  return (
    <div className="transport">
      <button
        className="icon-button"
        title="Restart"
        aria-label="Restart"
        disabled={!status.ready}
        onClick={() => media.seek(0)}
      >
        <SkipBack size={19} />
      </button>
      <button
        className="play-button"
        aria-label={status.playing ? 'Pause' : 'Play'}
        disabled={!status.ready || status.preparing}
        onClick={() =>
          media.toggle().catch(() => notify('Unable to start. Press Play to try again.'))
        }
      >
        {status.playing ? (
          <Pause size={22} fill="currentColor" />
        ) : (
          <Play size={22} fill="currentColor" />
        )}
      </button>
      <span className="time-readout" data-testid="current-time">
        {formatTime(time)}
      </span>
      <input
        className="seek"
        aria-label="Playback position"
        type="range"
        min={0}
        max={status.durationMs || 1}
        step={1}
        value={Math.min(time, status.durationMs)}
        disabled={!status.ready}
        style={
          {
            '--progress': `${status.durationMs ? (time / status.durationMs) * 100 : 0}%`,
          } as React.CSSProperties
        }
        onChange={(e) => media.seek(Number(e.target.value))}
      />
      <span className="time-readout total">{formatTime(status.durationMs)}</span>
      <select
        className="rate-select"
        aria-label="Playback speed"
        value={status.rate}
        onChange={(e) => media.setRate(Number(e.target.value))}
      >
        {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
          <option key={rate} value={rate}>
            {rate.toFixed(rate === 1 ? 1 : 2).replace(/0$/, rate === 1 ? '0' : '')}×
          </option>
        ))}
      </select>
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
      <button
        className="icon-button"
        aria-label="Fullscreen"
        title="Fullscreen"
        onClick={fullScreen}
      >
        <Maximize size={19} />
      </button>
    </div>
  );
}
