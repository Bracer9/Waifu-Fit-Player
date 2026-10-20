import { AudioSampleSink, Input, MP4, UrlSource } from 'mediabunny';
import { BpmEnvelope, estimateBpm, type BpmRequest, type BpmResponse } from './bpm';

const send = (message: BpmResponse) => self.postMessage(message);
self.onmessage = async ({ data }: MessageEvent<BpmRequest>) => {
  const input = new Input({
    formats: [MP4],
    source: new UrlSource(data.source, {
      maxCacheSize: 8 * 1024 * 1024,
      getRetryDelay: () => null,
    }),
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      send({ error: '当前视频没有音轨，无法检测 BPM。' });
      return;
    }
    if (!(await track.canDecode())) {
      send({ error: '当前视频的音频格式无法解码，请使用含 AAC 音轨的 MP4。' });
      return;
    }
    const duration = (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
    const start = Math.max(data.start, await track.getFirstTimestamp(), 0);
    const end = Math.min(data.end, start + 90, duration);
    if (end - start < 6) {
      send({ error: '当前节拍段的音频不足 6 秒，无法可靠检测 BPM。' });
      return;
    }
    const envelope = new BpmEnvelope(end - start);
    const sink = new AudioSampleSink(track);
    let lastProgress = -1;
    for await (const sample of sink.samples(start, end)) {
      try {
        const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
          const channel = new Float32Array(sample.numberOfFrames);
          sample.copyTo(channel, { planeIndex, format: 'f32-planar' });
          return channel;
        });
        envelope.push(channels, sample.sampleRate, sample.timestamp - start);
        const progress = Math.min(
          95,
          Math.round(((sample.timestamp + sample.duration - start) / (end - start)) * 95),
        );
        if (progress >= lastProgress + 2) {
          lastProgress = progress;
          send({ progress });
        }
      } finally {
        sample.close();
      }
    }
    const result = estimateBpm(envelope.onsets());
    if (result) send({ result });
    else send({ error: '未检测到稳定 BPM，请手动填写或尝试其他节拍段。' });
  } catch {
    send({ error: '读取视频音频失败，请确认视频可以正常播放后重试。' });
  } finally {
    input.dispose();
  }
};
