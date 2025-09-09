import { useZubridgeDispatch, useZubridgeStore } from '@zubridge/tauri';
import type { PropsWithChildren } from 'react';
import { type BridgeStateStore, useBridgeStatus } from '../hooks/useBridgeStatus';
import type { ActionHandlers, WindowInfo } from '../WindowInfo';
import { ZubridgeApp } from '../ZubridgeApp';

/**
 * Props for the TauriApp component
 */
export interface TauriAppProps extends PropsWithChildren {
  /**
   * Window information
   */
  windowInfo?: WindowInfo;

  /**
   * Title for the application window
   * @default 'Tauri App'
   */
  windowTitle?: string;

  /**
   * Application name shown in the header
   * @default 'Tauri App'
   */
  appName?: string;

  /**
   * Additional CSS classes to apply to the component
   */
  className?: string;
}

/**
 * Higher-order component that wraps ZubridgeApp with Tauri-specific functionality
 */
export function withTauri() {
  return function TauriApp({
    children,
    windowInfo = { id: 'main', type: 'main', platform: 'tauri' },
    windowTitle = 'Tauri App',
    appName = 'Tauri App',
    className = '',
  }: TauriAppProps) {
    // Get store and dispatch from Tauri hooks
    // Need to provide a selector function, even if it's identity
    const store = useZubridgeStore((state) => state);
    const dispatch = useZubridgeDispatch();
    // Cast store to any to avoid type error in useBridgeStatus
    const bridgeStatus = useBridgeStatus(store as BridgeStateStore);

    // Platform handlers for Tauri
    const actionHandlers: ActionHandlers = {
      createWindow: async () => {
        try {
          // Import dynamically to avoid issues with SSR
          const module = await import('@tauri-apps/api/webviewWindow');
          const WebviewWindow = module.WebviewWindow;
          const uniqueLabel = `window-${Date.now()}`;

          // Create a new window with the proper options
          await new WebviewWindow(uniqueLabel, {
            url: window.location.pathname,
            title: `Window (${uniqueLabel})`,
            width: 800,
            height: 600,
          });

          return { success: true, id: uniqueLabel };
        } catch (error) {
          console.error('Failed to create window:', error);
          return { success: false, error: String(error) };
        }
      },

      closeWindow: async () => {
        try {
          // Import dynamically to avoid issues with SSR
          const module = await import('@tauri-apps/api/webviewWindow');
          const WebviewWindow = module.WebviewWindow;
          const currentWindow = await WebviewWindow.getByLabel(windowInfo.id.toString());

          if (currentWindow) {
            await currentWindow.close();
            return { success: true };
          }
          throw new Error('Window not found');
        } catch (error) {
          console.error('Failed to close window:', error);
          return { success: false, error: String(error) };
        }
      },
    };

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
      >
        {children}
      </ZubridgeApp>
    );
  };
}
