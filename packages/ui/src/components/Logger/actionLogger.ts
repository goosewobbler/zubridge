import type { LogEntry } from './Logger';

/**
 * Options for creating an action logger
 */
export interface ActionLoggerOptions {
  /**
   * Maximum number of log entries to keep
   * @default 50
   */
  maxEntries?: number;

  /**
   * Callback function to handle new log entries
   * This allows integrating with external logging systems or state
   */
  onLog?: (entry: LogEntry) => void;

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
 * Action logger for tracking dispatched actions
 *
 * @example Simple usage:
 * ```ts
 * const logger = createActionLogger();
 *
 * // In your action handler or middleware
 * function handleAction(action) {
 *   logger.logAction(action.type, `Action dispatched: ${action.type}`, action.payload);
 *   // ... your normal action handling
 * }
 * ```
 *
 * @example Integration with useLogger hook:
 * ```tsx
 * // In a component
 * const { logs, clearLogs } = useLogger();
 * const actionLogger = useMemo(() => createActionLogger({
 *   onLog: (entry) => addLog(entry)
 * }), [addLog]);
 *
 * // Then use actionLogger in effect or callback
 * useEffect(() => {
 *   const unsubscribe = store.subscribe((state, action) => {
 *     if (action) {
 *       actionLogger.logAction(action.type, `Action: ${action.type}`, action.payload);
 *     }
 *   });
 *   return unsubscribe;
 * }, [actionLogger]);
 * ```
 */
export function createActionLogger(options: ActionLoggerOptions = {}) {
  const { maxEntries = 50, onLog, filter = () => true, transform = (action) => action } = options;

  // Internal log storage
  const logs: LogEntry[] = [];

  /**
   * Generate a unique ID for log entries
   */
  const generateId = (): string => {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  };

  /**
   * Add a new log entry
   */
  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry => {
    const logEntry: LogEntry = {
      id: generateId(),
      timestamp: new Date(),
      ...entry,
    };

    // Add to internal logs, maintaining max size
    logs.push(logEntry);
    if (logs.length > maxEntries) {
      logs.shift();
    }

    // Call external handler if provided
    if (onLog) {
      onLog(logEntry);
    }

    return logEntry;
  };

  /**
   * Log an action
   */
  const logAction = (
    type: string,
    message: string,
    payload?: any,
    level: LogEntry['level'] = 'info',
  ): LogEntry | null => {
    // Check if this action should be logged
    if (!filter({ type, payload })) {
      return null;
    }

    // Transform payload if needed
    const transformedPayload = transform(payload);

    return addLog({
      type,
      message,
      payload: transformedPayload,
      level,
    });
  };

  /**
   * Middleware-style function for Zubridge
   * Use with the dispatch function in Zubridge apps
   *
   * @example
   * ```ts
   * // Create a logging wrapper for your dispatch function
   * const dispatch = useDispatch();
   * const loggedDispatch = useCallback(
   *   (action) => {
   *     // Log the action
   *     actionLogger.middleware(action);
   *     // Pass to real dispatch
   *     return dispatch(action);
   *   },
   *   [dispatch, actionLogger]
   * );
   * ```
   */
  const middleware = (action: any): void => {
    // Handle both string actions and action objects
    if (typeof action === 'string') {
      logAction(action, `Action dispatched: ${action}`);
    } else if (action && typeof action === 'object' && 'type' in action) {
      logAction(action.type, `Action dispatched: ${action.type}`, action.payload || undefined);
    } else if (typeof action === 'function') {
      // For thunks, just log that a thunk was dispatched
      logAction('THUNK', 'Thunk action dispatched', { thunkFn: action.toString() });
    }
  };

  /**
   * Get all logs
   */
  const getLogs = (): LogEntry[] => {
    return [...logs];
  };

  /**
   * Clear all logs
   */
  const clearLogs = (): void => {
    logs.length = 0;
  };

  return {
    logAction,
    middleware,
    getLogs,
    clearLogs,
  };
}
