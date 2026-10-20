import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { menuPortalRoot } from '../menu-viewport';

export function ModalBackdrop({
  children,
  onClose,
  className = '',
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
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
        if (!elements.length) {
          event.preventDefault();
          return;
        }
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
  return createPortal(
    <div className={`modal-backdrop ${className}`} ref={ref}>
      {children}
    </div>,
    menuPortalRoot(),
  );
}
