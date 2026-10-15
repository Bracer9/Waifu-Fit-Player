import { useEffect, useRef, type ReactNode } from 'react';

export function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const target =
          event.shiftKey && document.activeElement === elements[0]
            ? elements.at(-1)
            : !event.shiftKey && document.activeElement === elements.at(-1)
              ? elements[0]
              : null;
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" ref={ref}>
      {children}
    </div>
  );
}
