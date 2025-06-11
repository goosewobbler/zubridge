import { useEffect, useCallback, ReactNode } from 'react';
import { debug } from '@zubridge/core';
import { WindowDisplay } from '../WindowDisplay';
import { CounterActions } from '../CounterActions';
import { ThemeToggle } from '../ThemeToggle';
import { WindowActions } from '../WindowActions';
import { Header } from '../Header';
import { SubscriptionControls } from '../SubscriptionControls';
import { ErrorTesting } from '../ErrorTesting';
import { BypassControls } from '../BypassControls';
import type { WindowInfo, ActionHandlers, WindowType } from './WindowInfo.js';
import { getWindowTitle } from './WindowInfo.js';
import { getCounterSelector, getThemeSelector, getBridgeStatusSelector } from './selectors.js';
import { CounterMethod } from '../../types.js';
import { GenerateLargeState } from '../GenerateLargeState';
import { Action, Dispatch } from '@zubridge/types';

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
  dispatch: Dispatch<Action>;

  /**
   * Platform-specific action handlers
   */
  actionHandlers: ActionHandlers;

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

  /**
   * Current subscriptions for this window
   * @default '*'
   */
  currentSubscriptions?: string[] | '*';

  /**
   * Handler for subscribing to specific state keys
   */
  onSubscribe?: (keys: string[]) => void;

  /**
   * Handler for unsubscribing from specific state keys
   */
  onUnsubscribe?: (keys: string[]) => void;

  /**
   * Handler for subscribing to all state
   */
  onSubscribeAll?: () => void;
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
  actionHandlers,
  bridgeStatus: externalBridgeStatus,
  windowTitle = 'Zubridge App',
  appName = 'Zubridge App',
  className = '',
  children,
  currentSubscriptions = '*',
  onSubscribe,
  onUnsubscribe,
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
  debug('ui', 'Bridge status:', bridgeStatus);
  debug('ui', 'Counter value:', counter);
  debug('ui', 'Theme mode:', isDarkMode ? 'dark' : 'light');

  // Apply theme based on state
  useEffect(() => {
    // Remove both theme classes first
    document.body.classList.remove('dark-theme', 'light-theme');

    // Add the appropriate theme class
    document.body.classList.add(isDarkMode ? 'dark-theme' : 'light-theme');
  }, [isDarkMode]);

  // Action handlers with logging
  const handleIncrement = useCallback(async () => {
    await dispatch('COUNTER:INCREMENT', window.bypassFlags);
  }, [dispatch]);

  const handleDecrement = useCallback(async () => {
    await dispatch('COUNTER:DECREMENT', window.bypassFlags);
  }, [dispatch]);

  const handleResetState = useCallback(async () => {
    await dispatch('STATE:RESET');
  }, [dispatch]);

  const handleGenerateLargeState = useCallback(
    async (variantOrOptions: any) => {
      // Check if we received a string variant or an options object
      if (typeof variantOrOptions === 'string' || variantOrOptions === undefined) {
        const variant = variantOrOptions || 'medium';
        debug('ui', `Generating ${variant} test state`);
        return await dispatch('STATE:GENERATE-FILLER', { variant });
      } else {
        // We received detailed options
        debug('ui', `Generating custom test state with options:`, variantOrOptions);
        return await dispatch('STATE:GENERATE-FILLER', variantOrOptions);
      }
    },
    [dispatch],
  );

  const handleDoubleCounter = useCallback(
    async (method: CounterMethod) => {
      if (method === 'thunk') {
        // Use the actionHandlers thunk if available
        if (actionHandlers.doubleCounter) {
          debug(
            'ui',
            `Using shared thunk for method: ${method} with bypassFlags: ${JSON.stringify(window.bypassFlags)}`,
          );
          return await dispatch(actionHandlers.doubleCounter(counter), window.bypassFlags);
        }
      } else if (method === 'slow-thunk') {
        // Use the slow thunk if available
        if (actionHandlers.doubleCounterSlow) {
          debug(
            'ui',
            `Using shared slow thunk for method: ${method} with bypassFlags: ${JSON.stringify(window.bypassFlags)}`,
          );
          return await dispatch(actionHandlers.doubleCounterSlow(counter), window.bypassFlags);
        }
      } else if (method === 'main-thunk') {
        debug('ui', `Starting ${method} execution`);
        debug('ui', `window.counter available:`, !!window.counter);
        debug('ui', `window.counter.executeMainThunk available:`, !!window.counter?.executeMainThunk);

        if (!window.counter?.executeMainThunk) {
          debug('ui:error', `window.counter.executeMainThunk not available for ${method}`);
          return Promise.reject(new Error('Main thunk execution not available'));
        }

        const result = window.counter.executeMainThunk();
        debug('ui', `${method} IPC call made, result:`, result);
        return result;
      } else if (method === 'slow-main-thunk') {
        debug('ui', `Starting ${method} execution`);
        debug('ui', `window.counter available:`, !!window.counter);
        debug('ui', `window.counter.executeMainThunkSlow available:`, !!window.counter?.executeMainThunkSlow);

        if (!window.counter?.executeMainThunkSlow) {
          debug('ui:error', `window.counter.executeMainThunkSlow not available for ${method}`);
          return Promise.reject(new Error('Main slow thunk execution not available'));
        }

        const result = window.counter.executeMainThunkSlow();
        debug('ui', `${method} IPC call made, result:`, result);
        return result;
      } else if (method === 'slow-object') {
        debug('ui', `Dispatching slow action for ${method}`);
        const result = await dispatch(
          {
            type: 'COUNTER:SET:SLOW',
            payload: counter * 2,
          },
          window.bypassFlags,
        );
        debug('ui', `Slow action dispatch returned:`, result);
        return result;
      } else {
        debug('ui', `Dispatching regular action for ${method}`);
        const result = await dispatch(
          {
            type: 'COUNTER:SET',
            payload: counter * 2,
          },
          window.bypassFlags,
        );
        debug('ui', `Regular action dispatch returned:`, result);
        return result;
      }
    },
    [counter, dispatch, actionHandlers],
  );

  const handleDistinctiveCounter = useCallback(
    async (method: CounterMethod) => {
      if (method === 'thunk') {
        // Use the actionHandlers thunk if available
        if (actionHandlers.distinctiveCounter) {
          debug(
            'ui',
            `Using distinctive thunk for method: ${method} with bypassFlags: ${JSON.stringify(window.bypassFlags)}`,
          );
          return await dispatch(actionHandlers.distinctiveCounter(counter), window.bypassFlags);
        }
      } else if (method === 'slow-thunk') {
        // Use the slow thunk if available
        if (actionHandlers.distinctiveCounterSlow) {
          debug(
            'ui',
            `Using distinctive slow thunk for method: ${method} with bypassFlags: ${JSON.stringify(window.bypassFlags)}`,
          );
          return await dispatch(actionHandlers.distinctiveCounterSlow(counter), window.bypassFlags);
        }
      }
      debug('ui:error', `Distinctive counter handler not available for ${method}`);
      return Promise.reject(new Error(`Distinctive counter handler not available for ${method}`));
    },
    [counter, dispatch, actionHandlers],
  );

  const handleToggleTheme = useCallback(async () => {
    await dispatch('THEME:TOGGLE');
  }, [dispatch]);

  // Window management
  const handleCreateWindow = useCallback(async () => {
    const result = await actionHandlers.createWindow();

    if (result.success) {
      // logAction('WINDOW:CREATE_SUCCESS', 'Window created successfully', { windowId: result.id });
    } else {
      // logAction('WINDOW:CREATE_ERROR', 'Failed to create window', {}, 'error');
    }
  }, [actionHandlers]);

  const handleCloseWindow = useCallback(async () => {
    await actionHandlers.closeWindow();
  }, [actionHandlers]);

  const handleQuitApp = useCallback(async () => {
    if (actionHandlers.quitApp) {
      await actionHandlers.quitApp();
    }
  }, [actionHandlers]);

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
        currentSubscriptions={currentSubscriptions}
        counterValue={counter}
        isLoading={bridgeStatus === 'initializing'}
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
              <div className="p-4 mb-4 border rounded-md counter-actions-section border-accent">
                <CounterActions
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onDouble={(method: CounterMethod) => handleDoubleCounter(method)}
                  onDistinctive={(method: CounterMethod) => handleDistinctiveCounter(method)}
                  isLoading={bridgeStatus === 'initializing'}
                />
              </div>

              <div className="mb-4 border rounded-md theme-sectionp-4 border-accent">
                <ThemeToggle theme={isDarkMode ? 'dark' : 'light'} onToggle={handleToggleTheme} />
              </div>

              <div className="p-4 mb-4 border rounded-md subscription-section border-accent">
                {onSubscribe && onUnsubscribe && (
                  <SubscriptionControls
                    onSubscribe={onSubscribe}
                    onUnsubscribe={onUnsubscribe}
                    onReset={handleResetState}
                  />
                )}

                <GenerateLargeState onGenerate={handleGenerateLargeState} />
              </div>

              <div className="p-4 mb-4 border rounded-md bypass-flags-section border-accent">
                <div className="pt-4 mt-5 border-t border-gray-200">
                  <BypassControls />
                </div>
              </div>

              <div className="p-4 mb-4 border rounded-md error-testing-section border-accent">
                <div className="pt-4 mt-5 border-t border-gray-200">
                  <ErrorTesting dispatch={dispatch} currentSubscriptions={currentSubscriptions} />
                </div>
              </div>

              <div className="p-4 mb-4 border rounded-md window-actions-section border-accent">
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
