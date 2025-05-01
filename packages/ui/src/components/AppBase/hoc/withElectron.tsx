import { useMemo } from 'react';
import type { WindowType } from '../WindowInfo';
import { ZubridgeApp } from '../ZubridgeApp';
import { createElectronAdapter } from '../adapters/electron';

// Note: These imports will be available in the consuming app
// We're just using type information here
type DispatchFunction = any;
type StoreType = any;

/**
 * Props for the ElectronApp component
 */
export interface ElectronAppProps {
  /**
   * The window ID
   */
  windowId: number;

  /**
   * The type of window
   */
  windowType: WindowType;

  /**
   * The mode name (e.g., 'basic', 'handlers', 'reducers')
   */
  modeName: string;

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

  /**
   * The Zubridge dispatch function
   * This should be provided by the consuming app
   */
  dispatch?: DispatchFunction;

  /**
   * The Zubridge store
   * This should be provided by the consuming app
   */
  store?: StoreType;
}

/**
 * Higher-order component that wraps ZubridgeApp with Electron-specific functionality
 */
export function ElectronApp({
  windowId,
  windowType,
  modeName,
  showLogger,
  showLoggerPayloads,
  dispatch,
  store,
}: ElectronAppProps) {
  // Create platform handlers
  const platformHandlers = useMemo(() => createElectronAdapter(window), []);

  // Verify we have the required props
  if (!dispatch || !store) {
    console.error('ElectronApp requires dispatch and store props');
    return <div>Error: Missing required props</div>;
  }

  return (
    <ZubridgeApp
      windowInfo={{
        id: windowId,
        type: windowType,
        platform: modeName,
      }}
      store={store}
      dispatch={dispatch}
      platformHandlers={platformHandlers}
      showLogger={showLogger}
      showLoggerPayloads={showLoggerPayloads}
    />
  );
}
