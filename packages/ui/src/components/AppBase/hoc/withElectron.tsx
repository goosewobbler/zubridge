import { createUseStore, useDispatch } from '@zubridge/electron';
import { debug } from '@zubridge/utils';
import { type PropsWithChildren, type ReactNode, useCallback } from 'react';
import { useBridgeStatus } from '../hooks/useBridgeStatus';
import type { ActionHandlers, WindowInfo } from '../WindowInfo';
import { ZubridgeApp } from '../ZubridgeApp';

/**
 * Props for the ElectronApp component
 */
export interface ElectronAppProps extends PropsWithChildren {
  /**
   * Window information
   */
  windowInfo?: WindowInfo;

  /**
   * Title for the application window
   * @default 'Electron App'
   */
  windowTitle?: string;

  /**
   * Application name shown in the header
   * @default 'Electron App'
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
   * Custom action handlers
   */
  actionHandlers?: ActionHandlers;

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
}

/**
 * Higher-order component that wraps ZubridgeApp with Electron-specific functionality
 */
export function withElectron() {
  // Create a store hook for this component
  const useStore = createUseStore();

  return function ElectronApp({
    children,
    windowInfo = { id: 'main', type: 'main', platform: 'electron' },
    windowTitle = 'Electron App',
    appName = 'Electron App',
    className = '',
    actionHandlers,
    currentSubscriptions = '*',
    onSubscribe,
    onUnsubscribe,
  }: ElectronAppProps) {
    // Get store and dispatch from Electron hooks
    const store = useStore();
    const dispatch = useDispatch();
    const bridgeStatus = useBridgeStatus(store);

    // Platform handlers for Electron
    const handleSubscribe = useCallback(async (keys: string[]) => {
      debug('ui', `[withElectron] Subscribing to keys: ${keys.join(', ')}`);
      try {
        await window.electronAPI?.subscribe(keys);
        debug('ui', '[withElectron] Subscribe call successful');
      } catch (error) {
        debug('ui:error', '[withElectron] Error in subscribe:', error);
      }
    }, []);

    const handleUnsubscribe = useCallback(async (keys: string[]) => {
      debug('ui', `[withElectron] Unsubscribing from keys: ${keys.join(', ')}`);
      try {
        await window.electronAPI?.unsubscribe(keys);
        debug('ui', '[withElectron] Unsubscribe call successful');
      } catch (error) {
        debug('ui:error', '[withElectron] Error in unsubscribe:', error);
      }
    }, []);

    return (
      <ZubridgeApp
        store={store}
        dispatch={dispatch}
        bridgeStatus={bridgeStatus}
        windowInfo={windowInfo}
        actionHandlers={actionHandlers as ActionHandlers}
        windowTitle={windowTitle}
        appName={appName}
        className={className}
        onSubscribe={onSubscribe || handleSubscribe}
        onUnsubscribe={onUnsubscribe || handleUnsubscribe}
        currentSubscriptions={currentSubscriptions}
      >
        {children}
      </ZubridgeApp>
    );
  };
}
