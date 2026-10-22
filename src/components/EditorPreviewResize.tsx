import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { MoveDiagonal2, RotateCcw } from 'lucide-react';

const STORAGE_KEY = 'waifu-fit-player-editor-preview-size';
type Size = { fraction: number; height: number };
type Limits = {
  width: number;
  gap: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
};
type Drag = {
  pointer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  limits: Limits;
  previous: Size | null;
};

/** Resize only the editor's existing grid; the shared video node never moves or reloads. */
export function EditorPreviewResize() {
  const grip = useRef<HTMLButtonElement>(null);
  const actions = useRef({
    reset: () => {},
    begin: (_event: ReactPointerEvent<HTMLButtonElement>) => {},
    step: (_x: number, _y: number) => {},
  });
  const drag = useRef<Drag | null>(null);
  const size = useRef<Size | null>(null);
  const pending = useRef<{ width: number; height: number } | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const handle = grip.current!;
    const stage = handle.closest<HTMLElement>('.stage-grid')!;
    const panel = handle.closest<HTMLElement>('.video-panel')!;
    const workspace = stage.closest<HTMLElement>('.editing')!;
    const editor = workspace.querySelector<HTMLElement>('.editor')!;
    const outerHeight = (node: Element) => {
      const style = getComputedStyle(node);
      return (
        node.getBoundingClientRect().height +
        (parseFloat(style.marginTop) || 0) +
        (parseFloat(style.marginBottom) || 0)
      );
    };

    const limits = (): Limits => {
      const width = stage.clientWidth;
      const gap = parseFloat(getComputedStyle(stage).columnGap) || 20;
      const left = stage.querySelector<HTMLElement>('.stage-left')!;
      const heading = left.querySelector<HTMLElement>('.lane-heading')!;
      const lanes = left.querySelector<HTMLElement>('.lanes-stack')!;
      const special = left.querySelector<HTMLElement>('.special-slot')!;
      const headingStyle = getComputedStyle(heading);
      const specialStyle = getComputedStyle(special);
      const minHeight = Math.ceil(
        heading.offsetHeight +
          parseFloat(headingStyle.marginBottom) +
          Array.from(lanes.children).reduce(
            (sum, lane) => sum + parseFloat(getComputedStyle(lane).minHeight),
            0,
          ) +
          (lanes.children.length - 1) * (parseFloat(getComputedStyle(lanes).rowGap) || 0) +
          special.offsetHeight +
          parseFloat(specialStyle.marginTop),
      );
      const minLeft = Math.min(420, Math.max(320, width * 0.28));
      const maxWidth = Math.max(300, width - gap - minLeft);
      // Reserve the actual toolbar/footer heights and all timeline rows at desktop
      // sizes. Smaller windows scroll inside the timeline, never the whole studio.
      const workspaceStyle = getComputedStyle(workspace);
      const editorStyle = getComputedStyle(editor);
      const chrome = Array.from(editor.children)
        .filter((node) => !node.classList.contains('editor-body'))
        .reduce((sum, node) => sum + outerHeight(node), 0);
      const timeline = editor.querySelector<HTMLElement>('.timeline-surface')!;
      const footer = editor.querySelector<HTMLElement>('.timeline-footer')!;
      const reservedTimeline = Math.min(timeline.offsetHeight + 8, window.innerHeight * 0.4);
      const remaining =
        workspace.clientHeight -
        parseFloat(workspaceStyle.paddingTop) -
        parseFloat(workspaceStyle.paddingBottom) -
        Array.from(workspace.children)
          .filter(
            (node) =>
              node !== stage &&
              node !== editor &&
              ['workspace-header', 'transport', 'workspace-bottom'].some((name) =>
                node.classList.contains(name),
              ),
          )
          .reduce((sum, node) => sum + outerHeight(node), 0) -
        (parseFloat(editorStyle.marginTop) || 0) -
        (parseFloat(editorStyle.borderTopWidth) || 0) -
        (parseFloat(editorStyle.borderBottomWidth) || 0) -
        chrome -
        outerHeight(footer) -
        reservedTimeline;
      return {
        width,
        gap,
        minWidth: Math.min(320, maxWidth),
        maxWidth,
        minHeight,
        maxHeight: Math.max(minHeight, Math.min(680, Math.floor(remaining))),
      };
    };

    const paint = (requested: Size | null, bounds = limits()) => {
      stage.style.setProperty('--editor-preview-max-height', `${bounds.maxHeight}px`);
      if (!requested) {
        delete stage.dataset.previewCustom;
        stage.style.removeProperty('--editor-preview-width');
        stage.style.removeProperty('--editor-preview-height');
        handle.setAttribute('aria-description', '默认尺寸。方向键调整宽高，Home 恢复。');
        return;
      }
      const width = Math.min(
        bounds.maxWidth,
        Math.max(bounds.minWidth, requested.fraction * bounds.width),
      );
      const height = Math.min(bounds.maxHeight, Math.max(bounds.minHeight, requested.height));
      stage.style.setProperty('--editor-preview-width', `${width}px`);
      stage.style.setProperty('--editor-preview-height', `${height}px`);
      stage.dataset.previewCustom = '';
      handle.setAttribute(
        'aria-description',
        `${Math.round(width)} × ${Math.round(height)} 像素。方向键调整宽高，Home 恢复。`,
      );
    };
    const save = () => {
      try {
        if (size.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(size.current));
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* Resizing works even when preferences cannot be stored. */
      }
    };
    const flush = () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      const next = pending.current;
      const current = drag.current;
      pending.current = null;
      if (!next || !current) return;
      const width = Math.min(
        current.limits.maxWidth,
        Math.max(current.limits.minWidth, next.width),
      );
      const height = Math.min(
        current.limits.maxHeight,
        Math.max(current.limits.minHeight, next.height),
      );
      size.current = { fraction: width / current.limits.width, height };
      paint(size.current, current.limits);
    };
    const cancel = () => {
      const current = drag.current;
      if (!current) return;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      pending.current = null;
      size.current = current.previous;
      drag.current = null;
      delete stage.dataset.previewResizing;
      paint(size.current);
      if (handle.hasPointerCapture(current.pointer)) handle.releasePointerCapture(current.pointer);
    };
    const finish = (event: PointerEvent) => {
      if (drag.current?.pointer !== event.pointerId) return;
      flush();
      drag.current = null;
      delete stage.dataset.previewResizing;
      save();
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointer) return;
      pending.current = {
        width: current.width - (event.clientX - current.x),
        height: current.height + (event.clientY - current.y),
      };
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    const refresh = () => {
      cancel();
      paint(size.current);
    };
    actions.current = {
      begin: (event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          width: panel.offsetWidth,
          height: stage.offsetHeight,
          limits: limits(),
          previous: size.current ? { ...size.current } : null,
        };
        stage.dataset.previewResizing = '';
        handle.focus({ preventScroll: true });
        handle.setPointerCapture(event.pointerId);
      },
      reset: () => {
        cancel();
        size.current = null;
        paint(null);
        save();
      },
      step: (x, y) => {
        const bounds = limits();
        const width = Math.min(bounds.maxWidth, Math.max(bounds.minWidth, panel.offsetWidth + x));
        const height = Math.min(
          bounds.maxHeight,
          Math.max(bounds.minHeight, stage.offsetHeight + y),
        );
        size.current = { fraction: width / bounds.width, height };
        paint(size.current, bounds);
        save();
      },
    };
    try {
      const stored: Size | null = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (
        stored &&
        Number.isFinite(stored.fraction) &&
        stored.fraction > 0 &&
        stored.fraction < 1 &&
        Number.isFinite(stored.height) &&
        stored.height > 0
      )
        size.current = stored;
    } catch {
      /* Invalid preferences fall back to the unchanged default layout. */
    }
    paint(size.current);
    // Rebudget when the window, toolbar wrapping or expanded STEP checks change.
    // Do not interrupt a pointer drag when its stage height changes the editor.
    const layoutObserver = new ResizeObserver(() => {
      if (!drag.current) paint(size.current);
    });
    layoutObserver.observe(workspace);
    layoutObserver.observe(editor);
    layoutObserver.observe(workspace.querySelector('.workspace-header')!);
    const observeChrome = () => {
      for (const node of editor.children)
        if (!node.classList.contains('editor-body')) layoutObserver.observe(node);
      layoutObserver.observe(editor.querySelector('.timeline-footer')!);
    };
    observeChrome();
    const chromeObserver = new MutationObserver(observeChrome);
    chromeObserver.observe(editor, { childList: true });
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('lostpointercapture', cancel);
    handle.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', refresh);
    window.addEventListener('keydown', key, true);
    return () => {
      chromeObserver.disconnect();
      layoutObserver.disconnect();
      cancelAnimationFrame(frame.current);
      drag.current = null;
      pending.current = null;
      delete stage.dataset.previewResizing;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('lostpointercapture', cancel);
      handle.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('keydown', key, true);
      // Practice shares this grid and media element; release editor-only styles.
      delete stage.dataset.previewCustom;
      stage.style.removeProperty('--editor-preview-width');
      stage.style.removeProperty('--editor-preview-height');
      stage.style.removeProperty('--editor-preview-max-height');
    };
  }, []);

  return (
    <span className="editor-preview-sizing">
      <span aria-hidden="true">↙ 拖拽缩放</span>
      <button
        type="button"
        className="editor-preview-reset"
        aria-label="恢复视频预览默认大小"
        title="恢复默认大小"
        onClick={() => actions.current.reset()}
      >
        <RotateCcw size={12} />
      </button>
      <button
        type="button"
        className="editor-preview-resize"
        ref={grip}
        aria-label="调整视频预览大小"
        title="向左增宽、向下增高；双击恢复。方向键微调，Home 恢复默认。"
        onPointerDown={(event) => actions.current.begin(event)}
        onDoubleClick={() => actions.current.reset()}
        onKeyDown={(event) => {
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [24, 0],
            ArrowRight: [-24, 0],
            ArrowDown: [0, 16],
            ArrowUp: [0, -16],
          };
          if (event.key !== 'Home' && !delta[event.key]) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Home') actions.current.reset();
          else actions.current.step(...delta[event.key]);
        }}
      >
        <MoveDiagonal2 size={15} />
      </button>
    </span>
  );
}
