import clsx from 'clsx';
import type React from 'react';

interface WindowDisplayProps {
  windowId: number | string;
  windowTitle: string;
  mode?: string;
  bridgeStatus?: 'ready' | 'error' | 'initializing';
  isMainWindow?: boolean;
  isRuntimeWindow?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * WindowDisplay component that shows information about the current window
 */
export const WindowDisplay: React.FC<WindowDisplayProps> = ({
  windowId: _windowId,
  windowTitle: _windowTitle,
  mode: _mode,
  bridgeStatus: _bridgeStatus = 'ready',
  isMainWindow = false,
  isRuntimeWindow = false,
  className = '',
  children,
}) => {
  const displayClasses = clsx(
    'window-display',
    isMainWindow && 'main-window',
    isRuntimeWindow && 'runtime-window',
    className,
  );

  return (
    <div className={displayClasses}>
      <div className="window-content">{children}</div>
    </div>
  );
};

export default WindowDisplay;
