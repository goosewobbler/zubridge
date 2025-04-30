import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: string;
  message: string;
  payload?: any;
  level: 'info' | 'warning' | 'error' | 'success';
}

export interface LoggerProps {
  /**
   * Array of log entries to display
   */
  entries: LogEntry[];

  /**
   * Maximum number of entries to display
   * @default 5
   */
  maxEntries?: number;

  /**
   * Whether the logger is expanded or collapsed
   * @default true
   */
  defaultExpanded?: boolean;

  /**
   * CSS class name to apply to the component
   */
  className?: string;

  /**
   * Optional function to clear logs
   */
  onClear?: () => void;

  /**
   * Whether to show timestamps
   * @default true
   */
  showTimestamps?: boolean;

  /**
   * Whether to show action payloads
   * @default false
   */
  showPayloads?: boolean;
}

export function Logger({
  entries,
  maxEntries = 5,
  defaultExpanded = true,
  className = '',
  onClear,
  showTimestamps = true,
  showPayloads = false,
}: LoggerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [displayedEntries, setDisplayedEntries] = useState<LogEntry[]>([]);

  // Update displayed entries when entries prop changes
  useEffect(() => {
    // Only keep the most recent entries up to maxEntries
    setDisplayedEntries(entries.slice(-maxEntries));
  }, [entries, maxEntries]);

  // Format timestamp
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Get CSS class for log level
  const getLevelClass = (level: LogEntry['level']): string => {
    switch (level) {
      case 'info':
        return 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-700';
      case 'warning':
        return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 dark:border-yellow-700';
      case 'error':
        return 'border-red-400 bg-red-50 dark:bg-red-900/30 dark:border-red-700';
      case 'success':
        return 'border-green-400 bg-green-50 dark:bg-green-900/30 dark:border-green-700';
      default:
        return 'border-gray-400 bg-gray-50 dark:bg-gray-800 dark:border-gray-700';
    }
  };

  // Get icon for log level
  const getLevelIcon = (level: LogEntry['level']): ReactElement => {
    switch (level) {
      case 'info':
        return <span className="text-blue-600 dark:text-blue-400 mr-2">ℹ️</span>;
      case 'warning':
        return <span className="text-yellow-600 dark:text-yellow-400 mr-2">⚠️</span>;
      case 'error':
        return <span className="text-red-600 dark:text-red-400 mr-2">❌</span>;
      case 'success':
        return <span className="text-green-600 dark:text-green-400 mr-2">✅</span>;
      default:
        return <span className="mr-2">•</span>;
    }
  };

  return (
    <div
      className={`logger-component border border-gray-200 dark:border-gray-700 rounded-md shadow-sm ${className}`}
      data-testid="logger-component"
    >
      <div
        className="logger-header flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-800 rounded-t-md cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <span className="text-sm font-medium">Action Log</span>
          <span className="ml-2 bg-gray-200 dark:bg-gray-700 text-xs rounded-full px-2 py-0.5">
            {displayedEntries.length}
          </span>
        </div>
        <div className="flex">
          {onClear && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-xs px-2 py-1 mr-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
              aria-label="Clear logs"
            >
              Clear
            </button>
          )}
          <span
            className="transform transition-transform duration-200"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="logger-content p-2 max-h-64 overflow-y-auto dark:bg-gray-900/50">
          {displayedEntries.length === 0 ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm italic">No logs to display</div>
          ) : (
            <ul className="space-y-2">
              {displayedEntries.map((entry) => (
                <li
                  key={entry.id}
                  className={`p-2 rounded border-l-4 text-sm ${getLevelClass(entry.level)}`}
                  data-testid={`log-entry-${entry.id}`}
                >
                  <div className="flex items-start">
                    {getLevelIcon(entry.level)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate">{entry.type}</span>
                        {showTimestamps && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                            {formatTime(entry.timestamp)}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">{entry.message}</p>

                      {showPayloads && entry.payload && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="text-xs font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                            {typeof entry.payload === 'object'
                              ? JSON.stringify(entry.payload, null, 2)
                              : String(entry.payload)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
