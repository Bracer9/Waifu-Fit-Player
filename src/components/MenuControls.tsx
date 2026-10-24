import { ArrowLeft, CornerDownLeft } from 'lucide-react';

export function MenuControls({
  onBack,
  showBack = false,
}: {
  onBack?: () => void;
  showBack?: boolean;
}) {
  return (
    <div className="menu-controls" aria-label="键盘操作提示">
      <div className="menu-controls-actions">
        <span className="menu-control menu-control-select" aria-label="方向键选择">
          <span className="menu-control-symbols" aria-hidden="true">
            <svg
              className="direction-keys"
              viewBox="0 0 36 28"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
            >
              <rect x="12.75" y="1" width="10.5" height="11" rx="1.5" />
              <rect x="0.75" y="15" width="10.5" height="11" rx="1.5" />
              <rect x="12.75" y="15" width="10.5" height="11" rx="1.5" />
              <rect x="24.75" y="15" width="10.5" height="11" rx="1.5" />
              <path d="M18 9V4M15.75 6.25 18 4l2.25 2.25M8.5 20.5h-5m2.25-2.25L3.5 20.5l2.25 2.25M18 18v5m-2.25-2.25L18 23l2.25-2.25M27.5 20.5h5m-2.25-2.25 2.25 2.25-2.25 2.25" />
            </svg>
          </span>
          <span className="menu-control-label">Select</span>
        </span>
        <span className="menu-control menu-control-enter" aria-label="回车确认">
          <CornerDownLeft aria-hidden="true" />
          <span className="menu-control-label">Enter</span>
        </span>
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
        {showBack && !onBack && (
          <span className="menu-control menu-control-back">
            <ArrowLeft aria-hidden="true" />
            <span className="menu-control-label">Back</span>
          </span>
        )}
      </div>
    </div>
  );
}
