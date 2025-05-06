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
  className = '',
  children,
}: ZubridgeAppProps) {
  // Extract data from store using selectors
  const counter = getCounterSelector(store);
  const isDarkMode = getThemeSelector(store);

  // Determine the bridge status - if externalBridgeStatus is provided, use it
  // Otherwise, try to get it from the store
  // Default to 'ready' if we can't determine status but we have a store
  let bridgeStatus: 'ready' | 'error' | 'initializing' = 'initializing';
  if (externalBridgeStatus) {
    bridgeStatus = externalBridgeStatus;
  } else if (store) {
    const storeStatus = getBridgeStatusSelector(store);
    // Only assign if it's a valid status string, otherwise use default
    if (storeStatus === 'ready' || storeStatus === 'error' || storeStatus === 'initializing') {
      bridgeStatus = storeStatus;
    } else {
      // If we have a store but no valid bridge status, assume 'ready'
      bridgeStatus = 'ready';
    }
  }

  // Add console log to track the bridge status
  console.log('[ZubridgeApp] Bridge status:', bridgeStatus);
  console.log('[ZubridgeApp] Counter value:', counter);
  console.log('[ZubridgeApp] Store:', store);

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
        // Create a thunk that simulates the testAsyncDouble behavior
        // but executes in the renderer process
        dispatch(async (getState: () => any, dispatch: any) => {
          const delayTime = 500; // milliseconds

          // Log initial state
          const currentState = getState();
          const currentValue = getCounterSelector(currentState);
          console.log(`[RENDERER THUNK] Starting with counter value: ${currentValue}`);

          // First async operation - double the value
          console.log(`[RENDERER THUNK] First operation: Quadrupling counter to ${currentValue * 4}`);
          await dispatch('COUNTER:SET', currentValue * 4);

          // Add delay to simulate async work
          await new Promise((resolve) => setTimeout(resolve, delayTime));

          // Log intermediate state after first operation
          const intermediateState = getState();
          const intermediateValue = getCounterSelector(intermediateState);
          console.log(`[RENDERER THUNK] After first operation: counter value is ${intermediateValue}`);

          // Second async operation - double the value again
          console.log(`[RENDERER THUNK] Second operation: Halving counter to ${intermediateValue * 2}`);
          await dispatch('COUNTER:SET', intermediateValue / 2);

          // Add delay to simulate async work
          await new Promise((resolve) => setTimeout(resolve, delayTime));

          // Log final state
          const finalState = getState();
          const finalValue = getCounterSelector(finalState);
          console.log(`[RENDERER THUNK] After second operation: counter value is ${finalValue}`);
          console.log(`[RENDERER THUNK] Test complete: expected ${currentValue * 2}, got ${finalValue}`);

          return finalValue;
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
