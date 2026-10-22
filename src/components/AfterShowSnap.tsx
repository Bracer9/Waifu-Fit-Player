import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AFTER_SHOW_SNAP, afterShowSnapLayout, captureAfterShowFrame } from '../after-show-snap';
import type { MediaController } from '../media';
import type { MenuSoundPlayer } from '../useMenuSounds';
import '../after-show-snap.css';

export function AfterShowSnap({
  media,
  trackNumber,
  onSound,
  onReady,
}: {
  media: MediaController;
  trackNumber?: number;
  onSound: MenuSoundPlayer;
  onReady: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sound = useRef(onSound);
  sound.current = onSound;
  const ready = useRef(onReady);
  ready.current = onReady;
  const [phase, setPhase] = useState<'waiting' | 'flash' | 'photo'>('waiting');
  const [layout, setLayout] = useState<ReturnType<typeof afterShowSnapLayout>>();
  const [capturedAt, setCapturedAt] = useState<Date>();
  useEffect(() => {
    const video = media.element;
    const node = root.current!;
    const image = canvas.current!;
    if (!video) {
      ready.current();
      return;
    }
    let captured = false;
    let revealTimer = 0;
    let readyTimer = 0;
    let stopSound: ReturnType<MenuSoundPlayer>;
    const resize = () => {
      if (!captured || !node.clientWidth || !node.clientHeight) return;
      setLayout(
        afterShowSnapLayout(node.clientWidth, node.clientHeight, image.width / image.height),
      );
    };
    const detach = () => {
      video.removeEventListener('seeked', capture);
      video.removeEventListener('loadeddata', capture);
    };
    const capture = () => {
      if (
        captured ||
        !node.clientWidth ||
        !node.clientHeight ||
        !captureAfterShowFrame(video, image)
      )
        return;
      captured = true;
      detach();
      window.clearTimeout(deadline);
      resize();
      setCapturedAt(new Date());
      stopSound = sound.current('shutter');
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setPhase('photo');
        ready.current();
      } else {
        setPhase('flash');
        revealTimer = window.setTimeout(() => setPhase('photo'), AFTER_SHOW_SNAP.flashMs);
        readyTimer = window.setTimeout(
          () => ready.current(),
          AFTER_SHOW_SNAP.flashMs + AFTER_SHOW_SNAP.revealMs,
        );
      }
    };
    // A range-end seek may still be decoding. Wait for its valid frame instead of seeking again.
    const timer = window.setTimeout(() => {
      video.addEventListener('seeked', capture);
      video.addEventListener('loadeddata', capture);
      capture();
    }, AFTER_SHOW_SNAP.delayMs);
    // Failure leaves the original paused video completely intact, with no empty paper or flash.
    const deadline = window.setTimeout(() => {
      detach();
      ready.current();
    }, AFTER_SHOW_SNAP.frameWaitMs);
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
      window.clearTimeout(revealTimer);
      window.clearTimeout(readyTimer);
      observer.disconnect();
      detach();
      if (typeof stopSound === 'function') stopSound();
      image.width = image.height = 0;
    };
  }, [media]);
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = capturedAt
    ? `${capturedAt.getFullYear()}.${pad(capturedAt.getMonth() + 1)}.${pad(capturedAt.getDate())}`
    : '';
  const time = capturedAt
    ? `${pad(capturedAt.getHours())}:${pad(capturedAt.getMinutes())}:${pad(capturedAt.getSeconds())}`
    : '';
  const style = {
    '--snap-flash-ms': `${AFTER_SHOW_SNAP.flashMs}ms`,
    '--snap-reveal-ms': `${AFTER_SHOW_SNAP.revealMs}ms`,
    ...(layout && {
      '--snap-width': `${layout.paperWidth}px`,
      '--snap-height': `${layout.paperHeight}px`,
      '--snap-border': `${layout.border}px`,
      '--snap-header': `${layout.header}px`,
      '--snap-start-y': `${-(layout.header - layout.border) / 2}px`,
      '--snap-scale': layout.scale,
      '--snap-settle-scale': layout.scale * 1.018,
      '--snap-angle': `${AFTER_SHOW_SNAP.angleDeg}deg`,
    }),
  } as CSSProperties;
  return (
    <div
      className="after-show-snap"
      ref={root}
      data-phase={phase}
      style={style}
      aria-hidden={phase !== 'photo'}
    >
      <span className="after-show-snap-shade" aria-hidden="true" />
      <figure className="after-show-snap-card" aria-label="演出纪念照片">
        <span className="after-show-snap-paper" aria-hidden="true" />
        <figcaption>
          <span>
            <strong>AFTER SHOW SNAP</strong>
            <small>
              TRACK {trackNumber === undefined ? '—' : String(trackNumber).padStart(2, '0')} /
              FINISHED
            </small>
          </span>
          <time dateTime={capturedAt?.toISOString()}>
            <strong>{date}</strong>
            <small>{time}</small>
          </time>
        </figcaption>
        <canvas ref={canvas} role="img" aria-label="当前曲目结束时的画面" />
        <span className="after-show-snap-sheen" aria-hidden="true" />
      </figure>
      <span className="after-show-snap-flash" aria-hidden="true" />
    </div>
  );
}
