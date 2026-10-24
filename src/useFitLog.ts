import { useEffect, useSyncExternalStore } from 'react';
import {
  emptyFitLog,
  mergeFitSession,
  FitLogAccumulator,
  parseFitCheckIns,
  type FitLogSession,
} from './fit-log';
import type { Chart } from './model';
import type { MediaController } from './media';

const endpoint = '/__wfp/fit-log';
type Snapshot = {
  sessions: FitLogSession[];
  checkIns: string[];
  checkingIn: boolean;
  ready: boolean;
  error: string;
  pending: boolean;
};
class FitLogClient {
  private snapshot: Snapshot = {
    sessions: [],
    checkIns: [],
    checkingIn: false,
    ready: false,
    error: '',
    pending: false,
  };
  private checkInRevision = 0;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private loading?: Promise<void>;
  private pending = new Map<string, FitLogSession>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  private emit(value: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((fn) => fn());
  }
  private merge(session: FitLogSession) {
    const all = new Map(this.snapshot.sessions.map((s) => [s.id, s]));
    all.set(session.id, mergeFitSession(all.get(session.id), session));
    return [...all.values()];
  }
  load = () => {
    if (this.loading) return this.loading;
    const revision = this.checkInRevision;
    this.loading = (async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
          throw new Error('本地记录服务暂不可用，请重新运行 start-demo。');
        const data = (await response.json()) as ReturnType<typeof emptyFitLog> & { error?: string };
        if (data.version !== 1 || !Array.isArray(data.sessions))
          throw new Error(data.error ?? '记录服务需要更新。');
        const all = new Map(data.sessions.map((s) => [s.id, s]));
        for (const session of this.snapshot.sessions)
          all.set(session.id, mergeFitSession(all.get(session.id), session));
        this.emit({
          sessions: [...all.values()],
          ready: true,
          error: '',
          ...(revision === this.checkInRevision && !this.snapshot.checkingIn
            ? { checkIns: parseFitCheckIns(data.checkIns) }
            : {}),
        });
        for (const session of this.pending.values()) void this.save(session);
      } catch (error) {
        this.emit({ error: (error as Error).message });
      } finally {
        this.loading = undefined;
      }
    })();
    return this.loading;
  };
  checkIn = (date: string, checked: boolean): Promise<boolean> => {
    if (this.snapshot.checkingIn) return Promise.resolve(false);
    this.checkInRevision++;
    this.emit({ checkingIn: true });
    const run = async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-WFP-Fit-Log': '1' },
          body: JSON.stringify({ action: 'check-in', date, checked }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? '打卡尚未保存。');
        this.checkInRevision++;
        this.emit({ checkIns: parseFitCheckIns(data.checkIns), error: '' });
        return true;
      } catch (error) {
        this.emit({ error: (error as Error).message });
        return false;
      } finally {
        this.emit({ checkingIn: false });
      }
    };
    const task = this.queue.catch(() => {}).then(run);
    this.queue = task;
    return task;
  };
  update = (session: FitLogSession) => {
    if (!session.days.some((d) => d.durationMs > 0)) return;
    this.pending.set(session.id, session);
    this.emit({ sessions: this.merge(session), pending: true });
  };
  save = (session: FitLogSession, keepalive = false) => {
    if (!session.days.some((d) => d.durationMs > 0)) return Promise.resolve();
    this.update(session);
    const run = async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          keepalive,
          headers: { 'Content-Type': 'application/json', 'X-WFP-Fit-Log': '1' },
          body: JSON.stringify(session),
        });
        const data = (await response.json()) as FitLogSession & { error?: string };
        if (!response.ok) throw new Error(data.error ?? '本地记录尚未保存。');
        const pending = this.pending.get(session.id);
        if (pending && pending.updatedAt <= data.updatedAt && pending.completed === data.completed)
          this.pending.delete(session.id);
        this.emit({
          sessions: this.merge(data),
          ready: true,
          error: '',
          pending: this.pending.size > 0,
        });
      } catch (error) {
        this.emit({ error: (error as Error).message, pending: true });
      }
    };
    if (keepalive) return run();
    this.queue = this.queue.catch(() => {}).then(run);
    return this.queue;
  };
}
export const fitLogClient = new FitLogClient();
export const useFitLogSnapshot = () =>
  useSyncExternalStore(fitLogClient.subscribe, fitLogClient.getSnapshot);

/** Events + one 1Hz sampler while playing; never subscribe React/App to the note frame clock. */
export function useFitLogRecording(
  media: MediaController,
  chart: Chart,
  enabled: boolean,
  attempt: number,
) {
  useEffect(() => {
    if (!enabled || !media.element) return;
    const video = media.element;
    let accumulator: FitLogAccumulator | undefined;
    let running = false;
    let mediaTime = video.currentTime * 1000;
    let wallTime = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;
    let savedAt = 0;
    let finished = false;
    const anchor = () => {
      mediaTime = video.currentTime * 1000;
      wallTime = Date.now();
    };
    const sample = () => {
      const now = Date.now(),
        time = video.currentTime * 1000;
      if (running && accumulator && !video.seeking && video.readyState >= 2) {
        accumulator.append(mediaTime, time, wallTime, now, video.playbackRate);
        const snapshot = accumulator.snapshot();
        fitLogClient.update(snapshot);
        if (now - savedAt >= 5000) {
          savedAt = now;
          void fitLogClient.save(snapshot);
        }
      }
      mediaTime = time;
      wallTime = now;
    };
    const stop = () => {
      sample();
      running = false;
      clearInterval(timer);
      timer = undefined;
      if (accumulator) void fitLogClient.save(accumulator.snapshot());
    };
    const start = () => {
      if (finished || running || video.paused || video.seeking || video.readyState < 2) return;
      accumulator ??= new FitLogAccumulator(chart, crypto.randomUUID(), Date.now());
      anchor();
      running = true;
      timer = setInterval(sample, 1000);
    };
    const seek = () => {
      running = false;
      clearInterval(timer);
      timer = undefined;
      anchor();
      if (accumulator) void fitLogClient.save(accumulator.snapshot());
    };
    const complete = () => {
      stop();
      finished = true;
      if (accumulator) {
        accumulator.session.completed = true;
        accumulator.session.updatedAt = Date.now();
        void fitLogClient.save(accumulator.snapshot());
      }
    };
    const leave = () => {
      sample();
      if (accumulator) void fitLogClient.save(accumulator.snapshot(), true);
    };
    const listeners: [string, () => void][] = [
      ['playing', start],
      ['pause', stop],
      ['waiting', stop],
      ['stalled', stop],
      ['seeking', seek],
      ['seeked', start],
      ['ratechange', anchor],
      ['emptied', stop],
    ];
    listeners.forEach(([event, fn]) => video.addEventListener(event, fn));
    const unsubscribe = media.subscribeEnded(complete);
    window.addEventListener('pagehide', leave);
    start();
    return () => {
      stop();
      unsubscribe();
      window.removeEventListener('pagehide', leave);
      listeners.forEach(([event, fn]) => video.removeEventListener(event, fn));
    };
  }, [media, chart, enabled, attempt]);
}
