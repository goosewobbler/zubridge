import { useCallback, useMemo } from 'react';
import { useLogger } from './useLogger';
import { createActionLogger } from './actionLogger';

/**
 * Options for the useLoggedDispatch hook
 */
export interface UseLoggedDispatchOptions {
  /**
   * Maximum number of log entries to keep
   * @default 10
   */
  maxEntries?: number;

  /**
   * Function to filter which actions should be logged
   * Return true to include, false to exclude
   */
  filter?: (action: any) => boolean;

  /**
   * Function to transform action before logging
   * Useful for sanitizing sensitive data or formatting
   */
  transform?: (action: any) => any;
}

/**
 * Hook that combines Zubridge dispatch with action logging
 *
 * @remarks
 * This hook is designed to work with both Electron and Tauri Zubridge implementations.
 * You need to provide the actual dispatch function from your Zubridge implementation.
 *
 * @example
 * ```tsx
 * // For electron
 * import { useDispatch } from '@zubridge/electron';
 *
 * function MyComponent() {
 *   const originalDispatch = useDispatch();
 *   const { dispatch, logs, clearLogs } = useLoggedDispatch(originalDispatch);
 *
 *   // Now use dispatch instead of originalDispatch
 *   const handleClick = () => {
 *     dispatch({ type: 'COUNTER:INCREMENT' });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleClick}>Increment</button>
 *       <Logger entries={logs} onClear={clearLogs} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useLoggedDispatch<T extends Function>(dispatch: T, options: UseLoggedDispatchOptions = {}) {
  const { maxEntries = 10, filter, transform } = options;

  // Create a logger instance using the useLogger hook
  const { logs, addLog, clearLogs } = useLogger({ maxEntries });

  // Create an action logger that will send entries to our useLogger hook
  const actionLogger = useMemo(
    () =>
      createActionLogger({
        maxEntries,
        onLog: addLog,
        filter,
        transform,
      }),
    [maxEntries, addLog, filter, transform],
  );

  // Create a wrapped dispatch function that logs actions before dispatching
  const loggedDispatch = useCallback(
    (action: any) => {
      // Log the action
      actionLogger.middleware(action);

      // Forward to real dispatch and return its result
      return dispatch(action);
    },
    [dispatch, actionLogger],
  );

  // Return both the logged dispatch function and the logs
  return {
    dispatch: loggedDispatch as unknown as T,
    logs,
    clearLogs,
    actionLogger,
  };
}
