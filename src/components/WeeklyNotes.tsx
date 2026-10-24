import { useEffect, useRef, useState } from 'react';
import { fitLogWeek, localFitDate } from '../fit-log';
import { fitLogClient, useFitLogSnapshot } from '../useFitLog';
import type { MenuSoundPlayer } from '../useMenuSounds';
import './weekly-notes.css';

const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// A decorative catalog mark; it intentionally contains no QR payload or link.
const catalogModules = Array.from({ length: 21 * 21 }, (_, index) => {
  const x = index % 21,
    y = Math.floor(index / 21);
  if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return '';
  return (x * 7 + y * 11 + x * y) % 5 < 2 ? `M${x} ${y}h1v1h-1Z` : '';
}).join('');

export function WeeklyNotes({ onSound }: { onSound: MenuSoundPlayer }) {
  const snapshot = useFitLogSnapshot();
  const [now, setNow] = useState(() => new Date());
  const [inspected, setInspected] = useState<number | null>(null);
  const [checkError, setCheckError] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [feedback, setFeedback] = useState<'saving' | 'engage' | 'release' | 'failed' | null>(null);
  const [reading, setReading] = useState<'confirmed' | 'count' | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selected = useRef<number | null>(null);
  const lastSound = useRef(0);
  const root = useRef<HTMLElement>(null);
  const week = fitLogWeek(snapshot.sessions, now, snapshot.checkIns);
  const today = localFitDate(now);
  const checkedToday = snapshot.checkIns.includes(today);
  const ready = snapshot.ready || snapshot.sessions.length > 0;
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      setNow(new Date());
      void fitLogClient.load();
    };
    const visible = () => {
      if (!document.hidden) refresh();
    };
    refresh();
    const timer = setInterval(visible, 60000);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      clearTimeout(feedbackTimer.current);
      clearTimeout(countTimer.current);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  const inspect = (index: number) => {
    if (selected.current === index) return;
    selected.current = index;
    setInspected(index);
    if (week.days[index].date !== today && performance.now() - lastSound.current > 90) {
      lastSound.current = performance.now();
      onSound('paper');
    }
  };
  const clear = () => {
    selected.current = null;
    setInspected(null);
  };
  const press = () => {
    if (!ready || busy.current || snapshot.checkingIn) return;
    setPressed(true);
    onSound('key-down');
  };
  const checkIn = async (date: string, checked: boolean) => {
    if (date !== localFitDate() || busy.current || snapshot.checkingIn || !ready) return;
    busy.current = true;
    setPressed(false);
    setFeedback('saving');
    setCheckError(false);
    clearTimeout(countTimer.current);
    setReading(null);
    const started = performance.now();
    const saved = await fitLogClient.checkIn(date, !checked);
    if (!mounted.current) return;
    // Leave a perceptible key stroke even when the local save returns immediately.
    feedbackTimer.current = setTimeout(
      () => {
        if (!mounted.current) return;
        setCheckError(!saved);
        setFeedback(saved ? (checked ? 'release' : 'engage') : 'failed');
        if (saved) {
          onSound(checked ? 'key-up' : 'key-lock');
          setReading(checked ? 'count' : 'confirmed');
          countTimer.current = setTimeout(
            () => {
              if (checked) setReading(null);
              else {
                setReading('count');
                countTimer.current = setTimeout(() => setReading(null), 750);
              }
            },
            checked ? 950 : 1200,
          );
        }
        feedbackTimer.current = setTimeout(() => {
          busy.current = false;
          setFeedback(null);
        }, 400);
      },
      Math.max(0, 100 - (performance.now() - started)),
    );
  };
  const day = inspected === null || reading ? null : week.days[inspected];
  const minutes = day ? Math.floor(day.durationMs / 60000) : 0;
  return (
    <div className="weekly-notes-slot">
      <section
        className="weekly-notes"
        ref={root}
        aria-label="本周跟练记录"
        onPointerLeave={clear}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) clear();
        }}
        onKeyDown={(event) => {
          if (
            ![
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'Escape',
              'Backspace',
              'Enter',
              ' ',
            ].includes(event.key)
          )
            return;
          event.stopPropagation();
          if (event.key === 'Enter' || event.key === ' ') return;
          event.preventDefault();
          if (['ArrowUp', 'ArrowDown', 'Escape', 'Backspace'].includes(event.key)) {
            clear();
            document
              .querySelector<HTMLElement>(
                event.key === 'ArrowUp'
                  ? '.menu-settings'
                  : '.collection-album[aria-current="true"]',
              )
              ?.focus({ preventScroll: true });
            return;
          }
          const index = inspected ?? (now.getDay() + 6) % 7;
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? 6
                : (index + (event.key === 'ArrowLeft' ? -1 : 1) + 7) % 7;
          root.current
            ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
            ?.focus({ preventScroll: true });
        }}
      >
        <div className="weekly-notes-shell" aria-hidden="true">
          <span className="weekly-notes-inlay" />
          <i className="weekly-notes-mount left" />
          <i className="weekly-notes-mount right" />
        </div>
        <div className="weekly-notes-edition">
          <span>WFP / {String(week.number).padStart(2, '0')}</span>
          <strong>WEEKLY NOTES</strong>
          <small role="status">
            {checkError
              ? 'SAVE FAILED · RETRY'
              : snapshot.checkingIn
                ? 'SAVING…'
                : checkedToday
                  ? 'TODAY CHECKED ✓'
                  : 'CHECK IN TODAY'}
          </small>
        </div>
        <div className="weekly-notes-days" role="group" aria-label="周一至周日">
          {week.days.map((entry, index) => (
            <button
              key={entry.date}
              type="button"
              className="weekly-day"
              data-index={index}
              data-active={entry.durationMs > 0 || entry.checked || undefined}
              data-checked={entry.checked || undefined}
              data-pressed={(entry.date === today && pressed) || undefined}
              data-feedback={entry.date === today ? (feedback ?? undefined) : undefined}
              data-inspected={inspected === index || undefined}
              aria-current={entry.date === today ? 'date' : undefined}
              aria-pressed={entry.date === today ? entry.checked : undefined}
              aria-busy={(entry.date === today && snapshot.checkingIn) || undefined}
              disabled={!ready}
              aria-disabled={
                (entry.date === today && (snapshot.checkingIn || feedback !== null)) || undefined
              }
              aria-label={`${entry.date}，${entry.durationMs > 0 ? `跟练 ${entry.durationMs < 60000 ? '不足 1' : Math.floor(entry.durationMs / 60000)} 分钟` : '尚无跟练记录'}${entry.date === today ? (entry.checked ? '，已打卡，再次点击撤销' : '，点击今日打卡') : ''}`}
              onPointerEnter={() => inspect(index)}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse') event.preventDefault();
                if (entry.date === today && event.button === 0) press();
              }}
              onPointerUp={() => setPressed(false)}
              onPointerCancel={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              onKeyDown={(event) => {
                if (entry.date !== today || !['Enter', ' '].includes(event.key)) return;
                if (event.repeat) event.preventDefault();
                else press();
              }}
              onKeyUp={() => setPressed(false)}
              onBlur={() => setPressed(false)}
              onFocus={() => inspect(index)}
              onClick={() => {
                inspect(index);
                void checkIn(entry.date, entry.checked);
              }}
            >
              <span aria-hidden="true">{labels[index]}</span>
              <i className="weekly-day-stamp" aria-hidden="true">
                {entry.date === today ? (
                  <span className="weekly-key-face">
                    <b />
                  </span>
                ) : (
                  entry.checked && (
                    <svg viewBox="0 0 20 20" fill="none">
                      <path d="m5 10 3.5 3.5L15 7" />
                    </svg>
                  )
                )}
              </i>
            </button>
          ))}
        </div>
        <output
          className="weekly-notes-reading"
          data-feedback={feedback ?? undefined}
          data-reading={reading ?? undefined}
          aria-live="off"
          aria-label={
            reading === 'confirmed'
              ? '今日打卡已保存'
              : day
                ? `${day.date} 跟练时长`
                : '本周活跃天数'
          }
        >
          <strong key={reading === 'confirmed' ? 'confirmed' : 'value'}>
            {reading === 'confirmed' ? (
              'CHECKED'
            ) : !ready ? (
              '—'
            ) : day ? (
              day.durationMs > 0 && minutes === 0 ? (
                '<1'
              ) : (
                minutes
              )
            ) : (
              <>
                <em>{String(week.activeDays).padStart(2, '0')}</em>
                <span>/07</span>
              </>
            )}
          </strong>
          <span>{reading === 'confirmed' ? 'TODAY' : day ? 'MIN' : 'DAYS'}</span>
        </output>
        <div className="weekly-notes-catalog" aria-hidden="true">
          <svg
            className="weekly-catalog-mark"
            viewBox="-2 -2 25 25"
            aria-hidden="true"
            focusable="false"
          >
            <path d={catalogModules} />
            {[
              [0, 0],
              [14, 0],
              [0, 14],
            ].map(([x, y]) => (
              <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
                <path fillRule="evenodd" d="M0 0h7v7H0Zm1 1v5h5V1Z" />
                <path d="M2 2h3v3H2Z" />
              </g>
            ))}
          </svg>
          <span>WFP / {String(week.number).padStart(2, '0')}</span>
        </div>
      </section>
    </div>
  );
}
