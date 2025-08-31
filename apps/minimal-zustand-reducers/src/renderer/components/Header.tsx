import type React from 'react';

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
 * Header component for test app using Tailwind
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
  const headerClasses = `z-10 flex items-center justify-between px-4 py-2 text-white bg-black/80 ${className}`;

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
      <div className="flex-1">
        {appName && <div className="text-sm font-bold">{appName}</div>}
        <h1 className="text-base font-normal">{windowTitle}</h1>
        {mode && <div className="mt-1 text-xs opacity-75">Mode: {mode}</div>}
        {windowId && <div className="mt-1 text-xs opacity-75">ID: {windowId}</div>}
      </div>

      {counterValue !== undefined && (
        <div className="flex-1 text-center">
          <h2 className="text-xl font-bold whitespace-nowrap">
            Counter: {isLoading ? '...' : counterValue}
          </h2>
        </div>
      )}

      <div className="flex flex-col items-end flex-1">
        <div className="flex items-center">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          <span className="ml-2">
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
