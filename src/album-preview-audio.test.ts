import { afterEach, expect, it, vi } from 'vitest';
import { createAlbumPreviewAudio, ALBUM_PREVIEW_AUDIO } from './album-preview-audio';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const parameter = (value = 1) => ({
    value,
    cancelAndHoldAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn((next: unknown) => next), disconnect: vi.fn() });
  const gains: ReturnType<typeof gain>[] = [];
  function gain() {
    return { ...node(), gain: parameter(), channelCount: 2, channelCountMode: 'max' };
  }
  const filters: ReturnType<typeof filter>[] = [];
  function filter() {
    return { ...node(), type: '', frequency: parameter(), gain: parameter(), Q: parameter() };
  }
  const voices: ReturnType<typeof voice>[] = [];
  function voice() {
    return {
      ...node(),
      buffer: null,
      loop: false,
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
  }
  const context = {
    currentTime: 12,
    destination: node(),
    createGain: () => {
      const n = gain();
      gains.push(n);
      return n;
    },
    createBiquadFilter: () => {
      const n = filter();
      filters.push(n);
      return n;
    },
    createBufferSource: () => {
      const n = voice();
      voices.push(n);
      return n;
    },
    decodeAudioData: vi.fn(async () => ({})),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
  );
  const output = createAlbumPreviewAudio(
    context as unknown as AudioContext,
    node() as unknown as MediaElementAudioSourceNode,
    node() as unknown as AnalyserNode,
    true,
  );
  return { output, gains, filters, voices, context };
}
it('opens with the muffled route, then restores a full dry preview without recreating the graph', () => {
  const { output, gains, filters } = fixture();
  expect(gains[0].gain.value).toBe(0.25);
  expect(gains[2].gain.value).toBeCloseTo(0.585);
  expect(filters.map((f) => f.type)).toEqual(['lowshelf', 'lowpass', 'lowpass']);
  output.setMuffled(false);
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
    1,
    12,
    ALBUM_PREVIEW_AUDIO.filterFadeSeconds,
  );
  expect(gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(
    0,
    12,
    ALBUM_PREVIEW_AUDIO.filterFadeSeconds,
  );
  expect(fetch).not.toHaveBeenCalled();
  output.setMuffled(true);
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
    0.25,
    12,
    ALBUM_PREVIEW_AUDIO.filterFadeSeconds,
  );
  expect(gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(
    ALBUM_PREVIEW_AUDIO.musicGain * ALBUM_PREVIEW_AUDIO.muffledMix,
    12,
    ALBUM_PREVIEW_AUDIO.filterFadeSeconds,
  );
  output.dispose();
});
it('loads mechanical audio once, reuses it, follows SE volume and stops/disconnects all voices', async () => {
  const { output, voices, context } = fixture();
  output.setMotor(true, 0.5);
  await vi.waitFor(() => expect(voices).toHaveLength(2));
  expect(voices.filter((v) => v.loop)).toHaveLength(1);
  output.setMotor(true, 0.2);
  expect(voices).toHaveLength(2);
  output.setMotor(false, 0.2);
  expect(voices[0].stop).toHaveBeenCalledWith(12.2);
  output.setMotor(true, 0);
  expect(voices).toHaveLength(2);
  output.setMotor(true, 0.5);
  await vi.waitFor(() => expect(voices).toHaveLength(3));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
  output.dispose();
  for (const voice of voices) expect(voice.disconnect).toHaveBeenCalled();
});
it('cannot start stale mechanical voices after closing while assets are loading', async () => {
  const { output, voices, context } = fixture();
  const finish: Array<(buffer: object) => void> = [];
  context.decodeAudioData.mockImplementation(
    () =>
      new Promise<object>((resolve) => {
        finish.push(resolve);
      }),
  );
  output.setMotor(true, 0.5);
  await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(2));
  output.setMotor(false, 0.5);
  output.dispose();
  finish.forEach((resolve) => resolve({}));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(voices).toHaveLength(0);
});
