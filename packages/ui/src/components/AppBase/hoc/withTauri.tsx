import React, { PropsWithChildren, useState, useEffect } from 'react';
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';
import { ZubridgeApp } from '../ZubridgeApp';
import type { PlatformHandlers, WindowInfo } from '../WindowInfo';

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
   * Whether to show window controls (maximize/minimize)
   * @default true
   */
  showWindowControls?: boolean;

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
    showWindowControls = true,
    className = '',
  }: TauriAppProps) {
    // Get store and dispatch from Tauri hooks
    const store = useZubridgeStore();
    const dispatch = useZubridgeDispatch();
    const [bridgeStatus, setBridgeStatus] = useState<'ready' | 'error' | 'initializing'>('initializing');

    // Update bridge status based on store
    useEffect(() => {
      if (store && store.__bridge_status) {
        setBridgeStatus(store.__bridge_status as 'ready' | 'error' | 'initializing');
      }
    }, [store]);

    // Platform handlers for Tauri
    const platformHandlers: PlatformHandlers = {
      createWindow: async () => {
        try {
          // Import dynamically to avoid issues with SSR
          const module = await import('@tauri-apps/api/webviewWindow');
          const WebviewWindow = module.WebviewWindow;
          const uniqueLabel = `window-${Date.now()}`;

          const webview = new WebviewWindow(uniqueLabel, {
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
          const currentWindow = WebviewWindow.getByLabel(windowInfo.id.toString());

          if (currentWindow) {
            await currentWindow.close();
            return { success: true };
          } else {
            throw new Error('Window not found');
          }
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
        platformHandlers={platformHandlers}
        windowTitle={windowTitle}
        appName={appName}
        showWindowControls={showWindowControls}
        className={className}
      >
        {children}
      </ZubridgeApp>
    );
  };
}
