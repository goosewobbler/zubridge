import { useEffect, useCallback } from 'react';
import { WindowDisplay } from '../WindowDisplay';
import { Counter } from '../Counter';
import { ThemeToggle } from '../ThemeToggle';
import { WindowActions } from '../WindowActions';
import { Logger } from '../Logger/Logger';
import { useLogger } from '../Logger/useLogger';
import type { WindowInfo, PlatformHandlers, WindowType } from './WindowInfo';
import { getWindowTitle } from './WindowInfo';
import { getCounterSelector, getThemeSelector, getBridgeStatusSelector } from './selectors';

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
   * Whether to show the logger component
   * @default true for main windows, false for others
   */
  showLogger?: boolean;

  /**
   * Whether to show action payloads in the logger
   * @default false
   */
  showLoggerPayloads?: boolean;
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
  showLogger = windowInfo.type === 'main',
  showLoggerPayloads = false,
}: ZubridgeAppProps) {
  // Extract data from store using selectors
  const counter = getCounterSelector(store);
  const isDarkMode = getThemeSelector(store);
  const bridgeStatus = getBridgeStatusSelector(store);

  // Get logger hook
  const { logs, logAction, clearLogs } = useLogger();

  // Apply theme based on state
  useEffect(() => {
    // Remove both theme classes first
    document.body.classList.remove('dark-theme', 'light-theme');

    // Add the appropriate theme class
    document.body.classList.add(isDarkMode ? 'dark-theme' : 'light-theme');
  }, [isDarkMode]);

  // Action handlers with logging
  const handleIncrement = useCallback(() => {
    logAction('COUNTER:INCREMENT', 'Incrementing counter');
    dispatch('COUNTER:INCREMENT');
  }, [dispatch, logAction]);

  const handleDecrement = useCallback(() => {
    logAction('COUNTER:DECREMENT', 'Decrementing counter');
    dispatch('COUNTER:DECREMENT');
  }, [dispatch, logAction]);

  const handleResetCounter = useCallback(() => {
    logAction('COUNTER:RESET', 'Resetting counter');
    dispatch('COUNTER:RESET');
  }, [dispatch, logAction]);

  const handleDoubleCounter = useCallback(
    (method: 'thunk' | 'object' | 'action') => {
      if (method === 'thunk') {
        logAction('COUNTER:DOUBLE_THUNK', 'Doubling counter via thunk', { currentValue: counter });
        dispatch((getState: () => any, dispatch: any) => {
          const currentState = getState();
          const currentValue = getCounterSelector(currentState);
          dispatch('COUNTER:SET', currentValue * 2);
        });
      } else {
        logAction('COUNTER:DOUBLE_OBJECT', 'Doubling counter via object', { currentValue: counter });
        dispatch({
          type: 'COUNTER:SET',
          payload: counter * 2,
        });
      }
    },
    [counter, dispatch, logAction],
  );

  const handleToggleTheme = useCallback(() => {
    logAction('THEME:TOGGLE', `Toggling theme to ${isDarkMode ? 'light' : 'dark'}`);
    dispatch('THEME:TOGGLE');
  }, [dispatch, isDarkMode, logAction]);

  // Window management
  const handleCreateWindow = useCallback(async () => {
    logAction('WINDOW:CREATE', 'Creating new window');
    const result = await platformHandlers.createWindow();

    if (result.success) {
      logAction('WINDOW:CREATE_SUCCESS', 'Window created successfully', { windowId: result.id });
    } else {
      logAction('WINDOW:CREATE_ERROR', 'Failed to create window', {}, 'error');
    }
  }, [platformHandlers, logAction]);

  const handleCloseWindow = useCallback(async () => {
    logAction('WINDOW:CLOSE', 'Closing window', { windowId: windowInfo.id });
    await platformHandlers.closeWindow();
  }, [platformHandlers, windowInfo.id, logAction]);

  const handleQuitApp = useCallback(async () => {
    if (platformHandlers.quitApp) {
      logAction('APP:QUIT', 'Quitting application');
      await platformHandlers.quitApp();
    }
  }, [platformHandlers, logAction]);

  // Get window properties
  const isMainWindow = windowInfo.type === 'main';
  const isRuntimeWindow = windowInfo.type === 'runtime';

  return (
    <div className="zubridge-app-container">
      <WindowDisplay
        windowId={windowInfo.id}
        windowTitle={getWindowTitle(windowInfo.type as WindowType, windowInfo)}
        mode={windowInfo.platform}
        bridgeStatus={bridgeStatus as 'ready' | 'error' | 'initializing'}
        isRuntimeWindow={isRuntimeWindow}
      >
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

        {showLogger && (
          <div className="mt-6 logger-section">
            <Logger entries={logs} showPayloads={showLoggerPayloads} onClear={clearLogs} />
          </div>
        )}
      </WindowDisplay>
    </div>
  );
}
