import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function GameStartCountdown({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [remaining, setRemaining] = useState(3);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
    const timers = [
      setTimeout(() => setRemaining(2), 1000),
      setTimeout(() => setRemaining(1), 2000),
      setTimeout(onComplete, 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return createPortal(
    <div
      className="game-countdown"
      role="dialog"
      aria-modal="true"
      aria-label="开始倒计时"
      ref={root}
      tabIndex={-1}
      onKeyDown={(event) => {
        event.stopPropagation();
        if ([' ', 'Enter', 'Tab', 'Escape'].includes(event.key)) event.preventDefault();
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div className="countdown-card">
        <span className="countdown-label">GET READY</span>
        <strong key={remaining} role="timer" aria-live="polite">
          {remaining}
        </strong>
        <span className="countdown-beats" aria-hidden="true">
          {[3, 2, 1].map((beat) => (
            <i key={beat} className={beat >= remaining ? 'lit' : ''} />
          ))}
        </span>
        <small>ESC 返回选曲</small>
      </div>
    </div>,
    document.body,
  );
}
