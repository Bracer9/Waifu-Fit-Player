import { useLayoutEffect, useState } from 'react';
import type { Chart } from './model';
import { MediaController, audioOutputErrorMessage } from './media';
import { prepareAssets, type AssetManifest } from './asset-cache';

export function playerAssets(chart: Chart): AssetManifest {
  // Common actions stay ready while recording adds notes. Only the song's
  // configured SPECIAL changes the manifest, not every chart edit.
  const images = ['/art/studio-scene-v4.png', '/art/crunch/impact.png', '/art/crunch/trail.png'];
  if (chart.specialMove) {
    const icon = chart.specialMove.icon;
    images.push(
      `/art/special/${icon}.png`,
      `/art/special/burst-${icon}.png`,
      '/art/special/star-white.png',
      '/art/special/star-cyan.png',
    );
    images.push('/art/special/hold-strip.png', '/art/special/hold-tail.png');
  }
  return {
    images,
    fonts: [500, 600, 700, 800, 900].map((weight) => `${weight} 16px "Barlow Condensed"`),
  };
}

function prepareVideoFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const events = ['loadeddata', 'canplay', 'seeked', 'error'];
    const finish = (error?: Error) => {
      clearTimeout(timer);
      events.forEach((event) => video.removeEventListener(event, check));
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new DOMException('Preparation cancelled', 'AbortError'));
    const check = () => {
      if (video.error)
        finish(
          new Error(
            audioOutputErrorMessage(video.error) || '视频未能准备好，请重试或重新选择视频。',
          ),
        );
      else if (video.currentSrc === video.src && video.readyState >= 3 && !video.seeking) finish();
    };
    const timer = setTimeout(() => finish(new Error('视频准备超时，请重试。')), 15000);
    events.forEach((event) => video.addEventListener(event, check));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else check();
  });
}

export function usePlayerPreparation(media: MediaController, source: string, chart: Chart) {
  const manifestKey = JSON.stringify(playerAssets(chart));
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([source, manifestKey, attempt]);
  const [state, setState] = useState({ key: '', progress: 0, done: false, error: '' });
  useLayoutEffect(() => {
    if (!source || !media.element) return;
    const controller = new AbortController();
    const video = media.element;
    media.pause();
    media.setPreparing(true);
    setState({ key, progress: 0, done: false, error: '' });
    let completed = 0,
      total = 0,
      videoReady = 0;
    const report = () => {
      if (!controller.signal.aborted)
        setState({ key, progress: (completed + videoReady) / (total + 1), done: false, error: '' });
    };
    // The mounted video is the only playback/clock element; no hidden playback,
    // duplicated audio, artificial wait, or whole-video decode into memory.
    Promise.all([
      prepareAssets(JSON.parse(manifestKey) as AssetManifest, (done, count) => {
        completed = done;
        total = count;
        report();
      }),
      prepareVideoFrame(video, controller.signal).then(() => {
        videoReady = 1;
        report();
      }),
    ])
      .then(() => {
        if (controller.signal.aborted) return;
        media.setPreparing(false);
        setState({ key, progress: 1, done: true, error: '' });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        controller.abort();
        setState({
          key,
          progress: 0,
          done: false,
          error: error instanceof Error ? error.message : '资源未能准备好，请重试。',
        });
      });
    return () => controller.abort();
  }, [media, source, manifestKey, attempt]);
  const pending = Boolean(source) && (state.key !== key || !state.done);
  return {
    pending,
    progress: state.key === key ? state.progress : 0,
    error: state.key === key ? state.error : '',
    retry: () => {
      if (media.element?.error) media.element.load();
      setAttempt((value) => value + 1);
    },
  };
}
