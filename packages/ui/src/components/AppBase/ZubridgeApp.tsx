import { useEffect, useCallback, ReactNode } from 'react';
import { WindowDisplay } from '../WindowDisplay';
import { Counter } from '../Counter';
import { ThemeToggle } from '../ThemeToggle';
import { WindowActions } from '../WindowActions';
import { Header } from '../Header';
import type { WindowInfo, PlatformHandlers, WindowType } from './WindowInfo.js';
import { getWindowTitle } from './WindowInfo.js';
import { getCounterSelector, getThemeSelector, getBridgeStatusSelector } from './selectors.js';

export interface ZubridgeAppProps {
  /**
   * Information about the current window
   */
  windowInfo: WindowInfo;

  /**
   * Application state store
   */
  store: any;

  /**
   * Dispatch function for actions
   */
  dispatch: any;

  /**
   * Platform-specific handlers
   */
  platformHandlers: PlatformHandlers;

  /**
   * Bridge status
   */
  bridgeStatus?: 'ready' | 'error' | 'initializing';

  /**
   * Title for the application window
   * @default 'Zubridge App'
   */
  windowTitle?: string;

  /**
   * Application name shown in the header
   * @default 'Zubridge App'
   */
  appName?: string;

  /**
   * Whether to show window controls (maximize/minimize)
   * @default true
   */
  showWindowControls?: boolean;

  /**
   * Additional CSS classes to apply to the component
   */
  className?: string;

  /**
   * Child elements to render
   */
  children?: ReactNode;
}

/**
 * Base application component that works across all platforms
 *
 * This component handles the common functionality shared between
 * Electron and Tauri implementations.
 */
export function ZubridgeApp({
  windowInfo,
  store,
  dispatch,
  platformHandlers,
  bridgeStatus: externalBridgeStatus,
  windowTitle = 'Zubridge App',
  appName = 'Zubridge App',
  showWindowControls = true,
  className = '',
  children,
}: ZubridgeAppProps) {
  // Extract data from store using selectors
  const counter = getCounterSelector(store);
  const isDarkMode = getThemeSelector(store);
  // Use external bridge status if provided, otherwise get from store
  const bridgeStatus = externalBridgeStatus || getBridgeStatusSelector(store);

  // Apply theme based on state
  useEffect(() => {
    // Remove both theme classes first
    document.body.classList.remove('dark-theme', 'light-theme');

    // Add the appropriate theme class
    document.body.classList.add(isDarkMode ? 'dark-theme' : 'light-theme');
  }, [isDarkMode]);

  // Action handlers with logging
  const handleIncrement = useCallback(() => {
    dispatch('COUNTER:INCREMENT');
  }, [dispatch]);

  const handleDecrement = useCallback(() => {
    dispatch('COUNTER:DECREMENT');
  }, [dispatch]);

  const handleResetCounter = useCallback(() => {
    dispatch('COUNTER:RESET');
  }, [dispatch]);

  const handleDoubleCounter = useCallback(
    (method: 'thunk' | 'object' | 'action') => {
      if (method === 'thunk') {
        dispatch((getState: () => any, dispatch: any) => {
          const currentState = getState();
          const currentValue = getCounterSelector(currentState);
          dispatch('COUNTER:SET', currentValue * 2);
        });
      } else {
        dispatch({
          type: 'COUNTER:SET',
          payload: counter * 2,
        });
      }
    },
    [counter, dispatch],
  );

  const handleToggleTheme = useCallback(() => {
    dispatch('THEME:TOGGLE');
  }, [dispatch]);

  // Window management
  const handleCreateWindow = useCallback(async () => {
    const result = await platformHandlers.createWindow();

    if (result.success) {
      // logAction('WINDOW:CREATE_SUCCESS', 'Window created successfully', { windowId: result.id });
    } else {
      // logAction('WINDOW:CREATE_ERROR', 'Failed to create window', {}, 'error');
    }
  }, [platformHandlers]);

  const handleCloseWindow = useCallback(async () => {
    await platformHandlers.closeWindow();
  }, [platformHandlers]);

  const handleQuitApp = useCallback(async () => {
    if (platformHandlers.quitApp) {
      await platformHandlers.quitApp();
    }
  }, [platformHandlers]);

  // Get window properties
  const isMainWindow = windowInfo.type === 'main';
  const isRuntimeWindow = windowInfo.type === 'runtime';

  return (
    <div className={`zubridge-app ${className}`}>
      <Header
        appName={appName}
        windowTitle={windowTitle}
        windowId={windowInfo.id}
        windowType={windowInfo.type}
        bridgeStatus={bridgeStatus as 'ready' | 'error' | 'initializing'}
        showWindowControls={showWindowControls}
      />

      <div className="p-4 main-content">
        <WindowDisplay
          windowId={windowInfo.id}
          windowTitle={getWindowTitle(windowInfo.type as WindowType, windowInfo)}
          mode={windowInfo.platform}
          bridgeStatus={bridgeStatus as 'ready' | 'error' | 'initializing'}
          isRuntimeWindow={isRuntimeWindow}
        >
          {children || (
            <>
              <Counter
                value={counter}
                onIncrement={handleIncrement}
                onDecrement={handleDecrement}
                onDouble={(method: 'thunk' | 'object' | 'action') => handleDoubleCounter(method)}
                onReset={handleResetCounter}
                isLoading={bridgeStatus === 'initializing'}
              />

              <div className="theme-section">
                <ThemeToggle theme={isDarkMode ? 'dark' : 'light'} onToggle={handleToggleTheme} />

                <WindowActions
                  onCreateWindow={handleCreateWindow}
                  onCloseWindow={handleCloseWindow}
                  onQuitApp={handleQuitApp}
                  isMainWindow={isMainWindow}
                />
              </div>
            </>
          )}
        </WindowDisplay>
      </div>
    </div>
  );
}
