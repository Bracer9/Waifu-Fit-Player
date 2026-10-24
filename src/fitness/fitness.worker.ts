import { Input, MP4, AudioSampleSink } from 'mediabunny';
import { createBpmSource } from '../bpm-source';
import { BpmEnvelope } from '../bpm';
import { generateFitness, type FitnessMessage } from './generate';
import type { Chart } from '../model';
import { MusicSpectrum } from './spectrum';

const send = (message: FitnessMessage) => self.postMessage(message);
self.onmessage = async ({ data }: MessageEvent<{ source: string; chart: Chart }>) => {
  const input = new Input({ formats: [MP4], source: createBpmSource(data.source) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('视频没有音轨。');
    if (!(await track.canDecode())) throw new Error('此浏览器无法解码视频中的音轨。');
    const duration = (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
    if (!Number.isFinite(duration) || duration > 1200)
      throw new Error('初版支持 20 分钟以内的音轨。');
    const envelope = new BpmEnvelope(duration);
    const spectral = new MusicSpectrum();
    const beatStart = (data.chart.playRange?.startMs ?? 0) / 1000;
    const beatEnd = Math.min(
      duration,
      beatStart + 60,
      (data.chart.playRange?.endMs ?? Infinity) / 1000,
    );
    let previous = -1;
    for await (const sample of new AudioSampleSink(track).samples(0, duration)) {
      try {
        const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
          const channel = new Float32Array(sample.numberOfFrames);
          sample.copyTo(channel, { planeIndex, format: 'f32-planar' });
          return channel;
        });
        envelope.push(channels, sample.sampleRate, sample.timestamp);
        const from = Math.max(0, Math.ceil((beatStart - sample.timestamp) * sample.sampleRate));
        const to = Math.min(
          sample.numberOfFrames,
          Math.ceil((beatEnd - sample.timestamp) * sample.sampleRate),
        );
        if (to > from)
          spectral.push(
            channels.map((c) => c.subarray(from, to)),
            sample.sampleRate,
            Math.max(0, sample.timestamp + from / sample.sampleRate - beatStart),
          );
        const progress = Math.min(
          65,
          Math.round(((sample.timestamp + sample.duration) / duration) * 65),
        );
        if (progress > previous + 1) {
          send({ progress, phase: '读取音轨，分析全曲节奏与能量' });
          previous = progress;
        }
      } finally {
        sample.close();
      }
    }
    send({
      result: generateFitness(
        data.chart,
        envelope.onsets(),
        envelope.levels(),
        undefined,
        (progress, phase) => send({ progress, phase }),
        spectral.data(),
      ),
    });
  } catch (error) {
    send({ error: error instanceof Error ? error.message : '生成失败，原谱面未修改。' });
  } finally {
    input.dispose();
  }
};
