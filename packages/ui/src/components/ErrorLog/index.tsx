import { useCallback } from 'react';
import { Button } from '../Button';

interface ErrorLogProps {
  errors: Array<{ message: string; timestamp: number }>;
  onClear?: () => void;
}

/**
 * Component to display error messages with timestamps
 */
export function ErrorLog({ errors, onClear }: ErrorLogProps) {
  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }, []);

  return (
    <div className="mt-4 error-log">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-red-600">Error Log</h4>
        {onClear && (
          <Button onClick={onClear} variant="close" size="sm" data-testid="clear-errors-btn">
            Clear
          </Button>
        )}
      </div>
      <div className="p-2 overflow-y-auto border border-red-300 rounded error-entries max-h-40 bg-red-50">
        {errors.length === 0 ? (
          <div className="text-sm italic text-gray-500">No errors</div>
        ) : (
          errors.map((error, index) => (
            <div
              key={`${error.timestamp}-${index}`}
              className="mb-2 error-log-entry last:mb-0"
              data-testid="error-entry"
            >
              <div className="text-sm">
                <span className="text-gray-500">[{formatTime(error.timestamp)}]</span>{' '}
                <span className="text-red-600">{error.message}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
