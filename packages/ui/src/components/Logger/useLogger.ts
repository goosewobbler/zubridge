import { useState, useCallback } from 'react';
import type { LogEntry } from './Logger';

interface UseLoggerOptions {
  /**
   * Maximum number of log entries to keep
   * @default 10
   */
  maxEntries?: number;
}

/**
 * Hook for managing log entries
 *
 * @example
 * ```tsx
 * const { logs, logInfo, logError, logAction, clearLogs } = useLogger();
 *
 * // Log an info message
 * logInfo('User signed in');
 *
 * // Log an action
 * logAction('AUTH:LOGIN', 'User authenticated successfully', { userId: '123' });
 *
 * // Log an error
 * logError('Failed to load data', new Error('Network error'));
 * ```
 */
export function useLogger({ maxEntries = 10 }: UseLoggerOptions = {}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  /**
   * Add a new log entry
   */
  const addLog = useCallback(
    (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
      const newEntry: LogEntry = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        timestamp: new Date(),
        ...entry,
      };

      setLogs((currentLogs) => {
        // Keep only the latest entries up to maxEntries
        const updatedLogs = [...currentLogs, newEntry];
        return updatedLogs.slice(-maxEntries);
      });

      return newEntry;
    },
    [maxEntries],
  );

  /**
   * Log an action (typically for state changes)
   */
  const logAction = useCallback(
    (type: string, message: string, payload?: any, level: LogEntry['level'] = 'info') => {
      return addLog({ type, message, payload, level });
    },
    [addLog],
  );

  /**
   * Log an info message
   */
  const logInfo = useCallback(
    (message: string, payload?: any) => {
      return addLog({
        type: 'INFO',
        message,
        payload,
        level: 'info',
      });
    },
    [addLog],
  );

  /**
   * Log a warning message
   */
  const logWarning = useCallback(
    (message: string, payload?: any) => {
      return addLog({
        type: 'WARNING',
        message,
        payload,
        level: 'warning',
      });
    },
    [addLog],
  );

  /**
   * Log an error message
   */
  const logError = useCallback(
    (message: string, payload?: any) => {
      return addLog({
        type: 'ERROR',
        message,
        payload,
        level: 'error',
      });
    },
    [addLog],
  );

  /**
   * Log a success message
   */
  const logSuccess = useCallback(
    (message: string, payload?: any) => {
      return addLog({
        type: 'SUCCESS',
        message,
        payload,
        level: 'success',
      });
    },
    [addLog],
  );

  /**
   * Clear all logs
   */
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    addLog,
    logAction,
    logInfo,
    logWarning,
    logError,
    logSuccess,
    clearLogs,
  };
}
