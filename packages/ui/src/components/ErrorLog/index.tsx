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

  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="error-log mt-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-red-600">Error Log</h4>
        {onClear && (
          <Button onClick={onClear} variant="close" size="sm" data-testid="clear-errors-btn">
            Clear
          </Button>
        )}
      </div>
      <div className="error-entries max-h-40 overflow-y-auto border border-red-300 rounded p-2 bg-red-50">
        {errors.map((error, index) => (
          <div key={`${error.timestamp}-${index}`} className="error-log-entry mb-2 last:mb-0" data-testid="error-entry">
            <div className="text-sm">
              <span className="text-gray-500">[{formatTime(error.timestamp)}]</span>{' '}
              <span className="text-red-600">{error.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
