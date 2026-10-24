import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Save } from 'lucide-react';
import './draft-save-menu.css';

export function DraftSaveMenu({
  disabled,
  onSave,
  onSaveAs,
}: {
  disabled: boolean;
  onSave: () => void;
  onSaveAs: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  const close = (focus = false) => {
    setOpen(false);
    if (focus) toggle.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div
      className="draft-save-control"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (!open) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          const items = Array.from(
            root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
          );
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}
    >
      <button className="button small dark" onClick={onSave} disabled={disabled}>
        <Save size={15} />
        保存草稿
      </button>
      <button
        className="button small dark draft-save-toggle"
        ref={toggle}
        aria-label="保存选项"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="draft-save-options" role="menu" aria-label="草稿保存选项">
          <button
            role="menuitem"
            onClick={() => {
              close(true);
              onSave();
            }}
          >
            保存<span>Ctrl+S</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              close(true);
              onSaveAs();
            }}
          >
            另存为…
          </button>
        </div>
      )}
    </div>
  );
}
