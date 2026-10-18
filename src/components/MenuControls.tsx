import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft } from 'lucide-react';

export function MenuControls({
  vertical = false,
  onBack,
}: {
  vertical?: boolean;
  onBack?: () => void;
}) {
  return (
    <div className="menu-controls" aria-label="键盘操作提示">
      {onBack && (
        <button
          className="menu-control menu-control-back"
          onClick={onBack}
          title="返回（Backspace / Esc）"
        >
          <ArrowLeft aria-hidden="true" />
          <span className="menu-control-label">Back</span>
        </button>
      )}
      <div className="menu-controls-actions">
        <span
          className="menu-control menu-control-select"
          aria-label={vertical ? '上下方向键选择' : '左右方向键选择'}
        >
          <span className="menu-control-symbols" aria-hidden="true">
            {vertical ? (
              <>
                <ArrowUp />
                <ArrowDown />
              </>
            ) : (
              <>
                <ArrowLeft />
                <ArrowRight />
              </>
            )}
          </span>
          <span className="menu-control-label">SELECT</span>
        </span>
        <span className="menu-control menu-control-enter" aria-label="回车确认">
          <CornerDownLeft aria-hidden="true" />
          <span className="menu-control-label">Enter</span>
        </span>
      </div>
    </div>
  );
}
