import { useStore, useDispatch, useBridgeStatus } from '@zubridge/electron';
import type { PropsWithChildren } from 'react';
import { ZubridgeApp } from '../ZubridgeApp';
import type { PlatformHandlers, WindowInfo } from '../WindowInfo';

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
 * Higher-order component that wraps ZubridgeApp with Electron-specific functionality
 */
export function withElectron() {
  return function ElectronApp({
    children,
    windowInfo = { id: 'main', type: 'main', platform: 'electron' },
    windowTitle = 'Electron App',
    appName = 'Electron App',
    showWindowControls = true,
    className = '',
  }: ElectronAppProps) {
    // Get store, bridge status, and dispatch from Electron hooks
    const store = useStore();
    const dispatch = useDispatch();
    const bridgeStatus = useBridgeStatus();

    // Platform handlers for Electron
    const platformHandlers: PlatformHandlers = {
      createWindow: async () => {
        try {
          if (!window.electron) {
            throw new Error('Electron API not available');
          }
          const result = await window.electron.createWindow();
          return { success: true, id: result.id };
        } catch (error) {
          console.error('Failed to create window:', error);
          return { success: false, error: String(error) };
        }
      },
      closeWindow: async () => {
        try {
          if (!window.electron) {
            throw new Error('Electron API not available');
          }
          await window.electron.closeWindow();
          return { success: true };
        } catch (error) {
          console.error('Failed to close window:', error);
          return { success: false, error: String(error) };
        }
      },
      quitApp: async () => {
        try {
          if (!window.electron) {
            throw new Error('Electron API not available');
          }
          await window.electron.quitApp();
          return { success: true };
        } catch (error) {
          console.error('Failed to quit app:', error);
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
