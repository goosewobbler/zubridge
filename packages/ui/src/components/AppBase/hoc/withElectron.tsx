import { createUseStore, useDispatch } from '@zubridge/electron';
import React, { type PropsWithChildren, type ReactNode } from 'react';
import { ZubridgeApp } from '../ZubridgeApp';
import { useBridgeStatus } from '../hooks/useBridgeStatus';
import type { ActionHandlers, WindowInfo } from '../WindowInfo';

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
  }: ElectronAppProps) {
    // Get store and dispatch from Electron hooks
    const store = useStore();
    const dispatch = useDispatch();
    const bridgeStatus = useBridgeStatus(store);

    // Platform handlers for Electron

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
