import { useEffect, useRef, useState } from 'react';
import { CalendarCheck2, ChartNoAxesCombined, Clock3, Flame } from 'lucide-react';
import { fitLogSummary, fitLogTime } from '../fit-log';
import { fitLogClient, useFitLogSnapshot } from '../useFitLog';
import { SettingsGearHalo } from './MenuSettings';
import { useCardHighlight } from '../useCardHighlight';
import './fit-log.css';

export function FitLog({ blocked, mode }: { blocked: boolean; mode: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const { activate } = useCardHighlight();
  const returnTo = useRef<HTMLElement | null>(null);
  const snapshot = useFitLogSnapshot();
  const summary = fitLogSummary(snapshot.sessions, new Date(), snapshot.checkIns);
  const time = fitLogTime(summary.durationMs);
  const available = snapshot.ready || snapshot.sessions.length > 0;
  const visible = open && !blocked;
  useEffect(() => {
    void fitLogClient.load();
    return () => clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);
  useEffect(() => {
    if (!visible) return;
    void fitLogClient.load();
    const timer = setInterval(() => void fitLogClient.load(), 30000);
    return () => clearInterval(timer);
  }, [visible]);
  const show = () => {
    clearTimeout(closeTimer.current);
    if (!blocked) setOpen(true);
  };
  const returnToMenu = () => {
    clearTimeout(closeTimer.current);
    setOpen(false);
    const next = returnTo.current?.isConnected
      ? returnTo.current
      : document.querySelector<HTMLElement>(
          '.play-mode, .collection-album[aria-current="true"], .record-card[aria-current="true"] .record-select',
        );
    activate(next);
    next?.focus({ preventScroll: true });
  };
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (
        !panel.current?.contains(document.activeElement) &&
        document.activeElement !== trigger.current
      )
        setOpen(false);
    }, 170);
  };
  return (
    <aside
      className="fit-log"
      data-open={visible || undefined}
      data-mode={mode}
      data-blocked={blocked || undefined}
      aria-label="Fit Log 运动记录"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') show();
      }}
      onPointerLeave={hide}
      onFocusCapture={(e) => {
        if (e.relatedTarget instanceof HTMLElement && !e.currentTarget.contains(e.relatedTarget))
          returnTo.current = e.relatedTarget;
        if (e.target.matches(':focus-visible')) show();
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          clearTimeout(closeTimer.current);
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (['Escape', 'Backspace', 'ArrowRight', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          returnToMenu();
          return;
        }
        if (
          visible &&
          ['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        ) {
          e.stopPropagation();
          if (e.key.startsWith('Arrow')) e.preventDefault();
        }
      }}
    >
      <span className="fit-log-signature" aria-hidden="true">
        YOUR PROGRESS.
        <br />
        KEEP MOVING.
      </span>
      <section
        className="fit-log-panel"
        id="fit-log-panel"
        ref={panel}
        aria-label="今日运动摘要"
        aria-hidden={!visible}
        inert={!visible}
      >
        <h2>
          FIT
          <br />
          LOG
        </h2>
        <dl>
          <div className="fit-log-metric">
            <dt>TODAY</dt>
            <dd>
              <div className="fit-log-value">
                <strong>{available ? Number(summary.estimatedKcal.toFixed(1)) : '—'}</strong>
                <Flame aria-hidden="true" />
              </div>
              <span>EST. KCAL</span>
            </dd>
          </div>
          <div className="fit-log-metric">
            <dt>TODAY</dt>
            <dd className="fit-log-time">
              <div
                className="fit-log-value"
                data-hours={time.hours > 0 || undefined}
                data-long-time={time.hours >= 10 || undefined}
              >
                {available ? (
                  <strong>
                    {time.hours > 0 && (
                      <>
                        {time.hours}
                        <small>h</small>
                      </>
                    )}
                    {time.underMinute ? '<1' : time.minutes}
                    {time.hours > 0 && <small>min</small>}
                  </strong>
                ) : (
                  <strong>—</strong>
                )}
                <Clock3 aria-hidden="true" />
              </div>
              <span>{time.hours > 0 ? 'TIME' : 'MIN'}</span>
            </dd>
          </div>
          <div className="fit-log-metric">
            <dt>STREAK</dt>
            <dd>
              <div className="fit-log-value">
                <strong>{available ? summary.streak : '—'}</strong>
                <CalendarCheck2 aria-hidden="true" />
              </div>
              <span>DAYS</span>
            </dd>
          </div>
        </dl>
        {(snapshot.error || !snapshot.ready || snapshot.pending) && (
          <p className="fit-log-status" role="status">
            {snapshot.error
              ? '本地记录暂未同步'
              : !snapshot.ready
                ? '正在读取本地记录…'
                : '正在保存到本地…'}
          </p>
        )}
        {snapshot.error && <p className="fit-log-error">{snapshot.error}</p>}
      </section>
      <button
        ref={trigger}
        className="icon-button fit-log-trigger"
        disabled={blocked}
        aria-label="Fit Log 运动记录"
        aria-expanded={visible}
        aria-controls="fit-log-panel"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') e.preventDefault();
        }}
        onClick={(e) => {
          if (e.detail === 0) show();
          else
            setOpen((value) =>
              e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch'
                ? !value
                : true,
            );
        }}
      >
        <SettingsGearHalo />
        <ChartNoAxesCombined size={96} strokeWidth={1.5} />
      </button>
    </aside>
  );
}
