import motorUrl from './assets/menu-sfx/player-run.wav';
import startUrl from './assets/menu-sfx/player-start.wav';

export const ALBUM_PREVIEW_AUDIO = {
  cutoffHz: 780,
  bassHz: 130,
  bassDb: 2,
  musicGain: 0.78,
  muffledMix: 0.75,
  filterFadeSeconds: 0.075,
  motorGain: 0.24,
  startGain: 0.8,
  motorFadeSeconds: 0.06,
} as const;

type Voice = { source: AudioBufferSourceNode; gain: GainNode; ending: boolean };

/** Album preview only. Shares the menu context; the actual game video never uses this graph. */
export function createAlbumPreviewAudio(
  context: AudioContext,
  source: MediaElementAudioSourceNode,
  meter: AnalyserNode,
  initiallyMuffled: boolean,
) {
  const dry = context.createGain();
  const mono = context.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = 'explicit';
  const bass = context.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = ALBUM_PREVIEW_AUDIO.bassHz;
  bass.gain.value = ALBUM_PREVIEW_AUDIO.bassDb;
  const lowpasses = [context.createBiquadFilter(), context.createBiquadFilter()];
  for (const filter of lowpasses) {
    filter.type = 'lowpass';
    filter.frequency.value = ALBUM_PREVIEW_AUDIO.cutoffHz;
    filter.Q.value = -3.0103;
  }
  const wet = context.createGain();
  let muffled = initiallyMuffled;
  dry.gain.value = muffled ? 1 - ALBUM_PREVIEW_AUDIO.muffledMix : 1;
  wet.gain.value = muffled ? ALBUM_PREVIEW_AUDIO.musicGain * ALBUM_PREVIEW_AUDIO.muffledMix : 0;
  source.connect(dry).connect(meter);
  source
    .connect(mono)
    .connect(bass)
    .connect(lowpasses[0])
    .connect(lowpasses[1])
    .connect(wet)
    .connect(meter);

  let disposed = false;
  let running = false;
  let volume = 0;
  let loop: Voice | undefined;
  let startup: Voice | undefined;
  const voices = new Set<Voice>();
  let buffers: Promise<[AudioBuffer, AudioBuffer]> | undefined;
  const abort = new AbortController();
  const ramp = (parameter: AudioParam, target: number, seconds: number) => {
    const now = context.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(parameter.value, now);
    }
    parameter.setTargetAtTime(target, now, seconds);
  };
  const loadBuffers = () =>
    (buffers ??= Promise.all(
      [motorUrl, startUrl].map(async (url) => {
        // Match the menu BGM transport: full ranges avoid local download-manager interception.
        const response = await fetch(url, { signal: abort.signal, headers: { Range: 'bytes=0-' } });
        if (!response.ok || response.status === 204) throw new Error('Player sound unavailable');
        return context.decodeAudioData(await response.arrayBuffer());
      }),
    ) as Promise<[AudioBuffer, AudioBuffer]>);
  const playVoice = (buffer: AudioBuffer, repeat: boolean, level: number): Voice => {
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.loop = repeat;
    const gain = context.createGain();
    gain.gain.value = 0;
    node.connect(gain).connect(context.destination);
    const voice = { source: node, gain, ending: false };
    voices.add(voice);
    node.onended = () => {
      node.disconnect();
      gain.disconnect();
      voices.delete(voice);
    };
    node.start();
    gain.gain.setTargetAtTime(level, context.currentTime, ALBUM_PREVIEW_AUDIO.motorFadeSeconds);
    return voice;
  };
  const stopVoice = (voice?: Voice) => {
    if (!voice || voice.ending) return;
    voice.ending = true;
    ramp(voice.gain.gain, 0, 0.035);
    voice.source.stop(context.currentTime + 0.2);
  };
  let request = 0;
  return {
    setMuffled(next: boolean) {
      if (disposed || muffled === next) return;
      muffled = next;
      ramp(
        dry.gain,
        next ? 1 - ALBUM_PREVIEW_AUDIO.muffledMix : 1,
        ALBUM_PREVIEW_AUDIO.filterFadeSeconds,
      );
      ramp(
        wet.gain,
        next ? ALBUM_PREVIEW_AUDIO.musicGain * ALBUM_PREVIEW_AUDIO.muffledMix : 0,
        ALBUM_PREVIEW_AUDIO.filterFadeSeconds,
      );
    },
    setMotor(next: boolean, nextVolume: number) {
      if (disposed) return;
      const wasRunning = running;
      running = next;
      volume = Math.max(0, Math.min(1, nextVolume));
      const token = ++request;
      if (!running || volume === 0) {
        stopVoice(loop);
        stopVoice(startup);
        loop = startup = undefined;
        return;
      }
      if (loop) {
        ramp(loop.gain.gain, volume * ALBUM_PREVIEW_AUDIO.motorGain, 0.04);
        if (startup && !startup.ending)
          ramp(startup.gain.gain, volume * ALBUM_PREVIEW_AUDIO.startGain, 0.04);
        return;
      }
      void loadBuffers()
        .then(([motor, start]) => {
          if (disposed || token !== request || !running || volume === 0 || loop) return;
          loop = playVoice(motor, true, volume * ALBUM_PREVIEW_AUDIO.motorGain);
          if (!wasRunning)
            startup = playVoice(start, false, volume * ALBUM_PREVIEW_AUDIO.startGain);
        })
        .catch(() => {
          /* Mechanical ambience must never block or interrupt the music. */
        });
    },
    dispose() {
      disposed = true;
      request++;
      abort.abort();
      for (const voice of voices) {
        voice.source.onended = null;
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
      }
      voices.clear();
      [dry, mono, bass, ...lowpasses, wet].forEach((node) => node.disconnect());
    },
  };
}
