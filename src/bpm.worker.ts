import { AudioSampleSink, Input, MP4 } from 'mediabunny';
import { BpmEnvelope, analyzeTempo, type BpmRequest, type BpmResponse } from './bpm';
import { createBpmSource } from './bpm-source';
import { analyzeFirstBeat } from './first-beat';
import { MusicSpectrum } from './fitness/spectrum';

const send = (message: BpmResponse) => self.postMessage(message);
self.onmessage = async ({ data }: MessageEvent<BpmRequest>) => {
  const target = data.firstBeatBpm === undefined ? 'BPM' : '第一拍';
  const input = new Input({
    formats: [MP4],
    source: createBpmSource(data.source),
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      send({ error: `当前视频没有音轨，无法检测${target}。` });
      return;
    }
    if (!(await track.canDecode())) {
      send({ error: '当前视频的音频格式无法解码，请使用含 AAC 音轨的 MP4。' });
      return;
    }
    const duration = (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
    const start = Math.max(data.start, await track.getFirstTimestamp(), 0);
    const end = Math.min(data.end, start + (data.firstBeatBpm === undefined ? 90 : 60), duration);
    if (end - start < 6) {
      send({ error: `当前节拍段的音频不足 6 秒，无法可靠检测${target}。` });
      return;
    }
    const envelope = new BpmEnvelope(end - start);
    const spectral = data.firstBeatBpm === undefined ? undefined : new MusicSpectrum();
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
        if (spectral) {
          const from = Math.max(0, Math.ceil((start - sample.timestamp) * sample.sampleRate));
          const to = Math.min(
            sample.numberOfFrames,
            Math.ceil((end - sample.timestamp) * sample.sampleRate),
          );
          if (to > from)
            spectral.push(
              channels.map((c) => c.subarray(from, to)),
              sample.sampleRate,
              Math.max(0, sample.timestamp + from / sample.sampleRate - start),
            );
        }
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
    const onsets = envelope.onsets();
    if (data.firstBeatBpm !== undefined) {
      const analysis = analyzeFirstBeat(onsets, data.firstBeatBpm, undefined, {
        spectrum: spectral!.data(),
        beatsPerBar: data.beatsPerBar,
      });
      if (analysis.kind === 'candidate')
        send({
          firstBeat: {
            ...analysis.result,
            timeMs: Math.round(start * 1000) + analysis.result.timeMs,
          },
        });
      else if (analysis.kind === 'ambiguous-origin' && analysis.candidatesMs.length > 1)
        send({
          candidates: {
            kind: 'first-beat',
            values: analysis.candidatesMs.map((ms) => Math.round(start * 1000) + ms),
          },
        });
      else if (analysis.kind === 'ambiguous-origin')
        send({
          error:
            analysis.reason === 'window-disagreement'
              ? '不同分析长度得到的起点不一致，无法确认小节第一拍。开头音效或强弱变化可能造成误判；Offset 未修改，请试听后手动设置。'
              : '候选起点后缺少连续节奏支持，可能只是独立音效，无法确认小节第一拍。Offset 未修改，请试听后手动设置。',
        });
      else send({ error: '未找到明确的第一拍候选，请核对 BPM 或试听后手动设置。' });
      return;
    }
    const analysis = analyzeTempo(onsets);
    if (analysis.kind === 'stable') send({ result: analysis.result });
    else if (analysis.kind === 'varying')
      send({ candidates: { kind: 'bpm', values: analysis.candidates } });
    else send({ error: '未检测到稳定 BPM，请手动填写或尝试其他节拍段。' });
  } catch {
    send({ error: '读取视频音频失败，请确认视频可以正常播放后重试。' });
  } finally {
    input.dispose();
  }
};
