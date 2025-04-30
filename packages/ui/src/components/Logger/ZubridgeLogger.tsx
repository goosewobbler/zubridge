import { useState, useEffect, useCallback } from 'react';
import { Logger } from './Logger';
import { useLogger } from './useLogger';
import { createActionLogger } from './actionLogger';

export interface ZubridgeLoggerProps {
  /**
   * The Zubridge store object
   * - For Electron: Pass the result of useStore() from @zubridge/electron
   * - For Tauri: Pass the result of useZubridgeStore() from @zubridge/tauri
   */
  store: any;

  /**
   * The Zubridge dispatch function
   * - For Electron: Pass the result of useDispatch() from @zubridge/electron
   * - For Tauri: Pass the result of useZubridgeDispatch() from @zubridge/tauri
   */
  dispatch: Function;

  /**
   * Maximum number of entries to display
   * @default 5
   */
  maxEntries?: number;

  /**
   * Whether to show action payloads
   * @default false
   */
  showPayloads?: boolean;

  /**
   * Whether the logger starts expanded
   * @default true
   */
  defaultExpanded?: boolean;

  /**
   * CSS class name to apply to the component
   */
  className?: string;

  /**
   * Optional filter for which actions should be logged
   */
  actionFilter?: (action: any) => boolean;
}

/**
 * A logger component that integrates with Zubridge to display actions and state changes.
 * Works with both Electron and Tauri implementations.
 *
 * @example
 * ```tsx
 * // For Electron
 * import { useStore, useDispatch } from '@zubridge/electron';
 *
 * function App() {
 *   const store = useStore();
 *   const dispatch = useDispatch();
 *
 *   return (
 *     <div>
 *       <ZubridgeLogger store={store} dispatch={dispatch} />
 *     </div>
 *   );
 * }
 *
 * // For Tauri
 * import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';
 *
 * function App() {
 *   const store = useZubridgeStore();
 *   const dispatch = useZubridgeDispatch();
 *
 *   return (
 *     <div>
 *       <ZubridgeLogger store={store} dispatch={dispatch} />
 *     </div>
 *   );
 * }
 * ```
 */
export function ZubridgeLogger({
  store,
  dispatch,
  maxEntries = 5,
  showPayloads = false,
  defaultExpanded = true,
  className = '',
  actionFilter,
}: ZubridgeLoggerProps) {
  const { logs, addLog, clearLogs } = useLogger({ maxEntries });
  const [originalDispatch] = useState(() => dispatch);

  // Create an action logger instance
  const actionLogger = createActionLogger({
    maxEntries,
    onLog: addLog,
    filter: actionFilter,
  });

  // Wrap the dispatch function to log actions
  const loggedDispatch = useCallback(
    (action: any) => {
      actionLogger.middleware(action);
      return originalDispatch(action);
    },
    [originalDispatch, actionLogger],
  );

  // Replace the global dispatch function (if possible)
  useEffect(() => {
    // Some implementations might allow replacing the dispatch function
    // but this is implementation-dependent, so we don't rely on it

    // For now, we'll just log a message indicating that the consumer
    // should use our logged dispatch function instead
    console.info(
      'ZubridgeLogger: For complete action logging, use the returned "dispatch" function instead of the original',
    );

    return () => {
      // Cleanup if needed
    };
  }, [originalDispatch]);

  // Log bridge status changes
  useEffect(() => {
    if (store && store.__bridge_status) {
      const status = store.__bridge_status;
      const level = status === 'ready' ? 'success' : status === 'error' ? 'error' : 'info';

      addLog({
        type: 'BRIDGE:STATUS',
        message: `Bridge status: ${status}`,
        payload: { status },
        level: level as any,
      });
    }
  }, [store?.__bridge_status, addLog]);

  return (
    <div className={className}>
      <Logger
        entries={logs}
        maxEntries={maxEntries}
        defaultExpanded={defaultExpanded}
        showPayloads={showPayloads}
        onClear={clearLogs}
      />
    </div>
  );
}
