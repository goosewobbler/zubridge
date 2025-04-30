import { useMemo } from 'react';
import type { WindowType } from '../WindowInfo';
import { ZubridgeApp } from '../ZubridgeApp';
import { createTauriAdapter } from '../adapters/tauri';

// Note: These imports will be available in the consuming app
// We're just using type information here
type DispatchFunction = any;
type StoreType = any;

/**
 * Props for the TauriApp component
 */
export interface TauriAppProps {
  /**
   * The window label
   */
  windowLabel: string;

  /**
   * The type of window (defaults to 'main' unless it starts with 'runtime_')
   */
  windowType?: WindowType;

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

  /**
   * The WebviewWindow constructor from Tauri
   */
  WebviewWindow?: any;

  /**
   * The invoke function from Tauri
   */
  invoke?: any;

  /**
   * Whether this is Tauri v1
   */
  isV1?: boolean;
}

/**
 * Higher-order component that wraps ZubridgeApp with Tauri-specific functionality
 */
export function TauriApp({
  windowLabel,
  windowType: propWindowType,
  showLogger,
  showLoggerPayloads,
  dispatch,
  store,
  WebviewWindow,
  invoke,
  isV1 = false,
}: TauriAppProps) {
  // Determine window type based on label if not provided
  const windowType = useMemo(() => {
    if (propWindowType) return propWindowType;
    if (windowLabel.startsWith('runtime_')) return 'runtime';
    return 'main';
  }, [propWindowType, windowLabel]);

  // Verify we have the required props
  if (!dispatch || !store || !WebviewWindow) {
    console.error('TauriApp requires dispatch, store, and WebviewWindow props');
    return <div>Error: Missing required props</div>;
  }

  // Create platform handlers
  const platformHandlers = useMemo(
    () =>
      createTauriAdapter({
        WebviewWindow,
        invoke,
        windowLabel,
        isV1,
      }),
    [WebviewWindow, invoke, windowLabel, isV1],
  );

  return (
    <ZubridgeApp
      windowInfo={{
        id: windowLabel,
        type: windowType,
        platform: isV1 ? 'tauri-v1' : 'tauri',
      }}
      store={store}
      dispatch={dispatch}
      platformHandlers={platformHandlers}
      showLogger={showLogger}
      showLoggerPayloads={showLoggerPayloads}
    />
  );
}
