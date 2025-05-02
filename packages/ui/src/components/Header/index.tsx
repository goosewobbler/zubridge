import React from 'react';
import clsx from 'clsx';

interface HeaderProps {
  windowId: number | string;
  windowTitle: string;
  windowType?: string;
  appName?: string;
  mode?: string;
  bridgeStatus?: 'ready' | 'error' | 'initializing';
  className?: string;
}

/**
 * Header component that displays window information and bridge status
 */
export const Header: React.FC<HeaderProps> = ({
  windowId,
  windowTitle,
  appName,
  mode,
  bridgeStatus = 'ready',
  className = '',
}) => {
  const headerClasses = clsx(
    'z-10 flex items-center justify-between px-4 py-2 text-white bg-black/80',
    `status-${bridgeStatus}`,
    className,
  );

  return (
    <header className={headerClasses}>
      <div className="header-left">
        {appName && <div className="text-sm font-bold app-name">{appName}</div>}
        <h1 className="window-title">{windowTitle}</h1>
        {mode && <div className="mt-1 text-xs opacity-75 window-mode">Mode: {mode}</div>}
        {windowId && <div className="mt-1 text-xs opacity-75 window-type">ID: {windowId}</div>}
      </div>

      <div className="header-right">
        <div className="flex items-center bridge-status">
          <span className="inline-block w-2 h-2 rounded-full status-indicator" />
          <span className="ml-2 status-text">
            Bridge: {bridgeStatus.charAt(0).toUpperCase() + bridgeStatus.slice(1)}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
