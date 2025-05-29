import React from 'react';
import clsx from 'clsx';

interface HeaderProps {
  windowId: number | string;
  windowTitle: string;
  currentSubscriptions?: string[] | '*';
  windowType?: string;
  appName?: string;
  mode?: string;
  bridgeStatus?: 'ready' | 'error' | 'initializing';
  className?: string;
  counterValue?: number;
  isLoading?: boolean;
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
  currentSubscriptions,
  counterValue,
  isLoading = false,
}) => {
  const headerClasses = clsx(
    'z-10 flex items-center justify-between px-4 py-2 text-white bg-black/80',
    // Fixed header is nice but it breaks e2e tests
    window.process.env.TEST !== 'true' ? 'fixed top-0 left-0 right-0' : '',
    `status-${bridgeStatus}`,
    className,
  );

  // Determine subscription display text
  let subscriptionsText: string;
  if (currentSubscriptions === '*') {
    subscriptionsText = '*';
  } else if (Array.isArray(currentSubscriptions) && currentSubscriptions.length > 0) {
    subscriptionsText = currentSubscriptions.join(', ');
  } else {
    subscriptionsText = 'none';
  }

  return (
    <header className={headerClasses}>
      <div className="flex-1 header-left">
        {appName && <div className="text-sm font-bold app-name">{appName}</div>}
        <h1 className="window-title">{windowTitle}</h1>
        {mode && <div className="mt-1 text-xs opacity-75 window-mode">Mode: {mode}</div>}
        {windowId && <div className="mt-1 text-xs opacity-75 window-type">ID: {windowId}</div>}
      </div>

      {counterValue !== undefined && (
        <div className="flex-1 text-center">
          <h2 className="text-xl font-bold whitespace-nowrap">Counter: {isLoading ? '...' : counterValue}</h2>
        </div>
      )}

      <div className="flex flex-col items-end flex-1 header-right">
        <div className="flex items-center bridge-status">
          <span className="inline-block w-2 h-2 rounded-full status-indicator" />
          <span className="ml-2 status-text">
            Bridge: {bridgeStatus.charAt(0).toUpperCase() + bridgeStatus.slice(1)}
          </span>
        </div>
        <div className="flex items-center">
          <span className="text-xs opacity-75">Subscriptions: {subscriptionsText}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
