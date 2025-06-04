import { useCallback } from 'react';
import { debug } from '@zubridge/core';

interface ErrorLogProps {
  errors: Array<{ message: string; timestamp: number }>;
  onClear: () => void;
}

export function ErrorLog({ errors, onClear }: ErrorLogProps) {
  if (errors.length === 0) {
    return (
      <div
        className="p-4 mt-4 italic text-center text-gray-500 border border-gray-200 rounded-md bg-gray-50"
        data-testid="error-log"
      >
        No errors logged
      </div>
    );
  }

  return (
    <div
      className="p-3 mt-4 overflow-y-auto border border-gray-200 rounded-md bg-gray-50 max-h-52"
      data-testid="error-log"
    >
      <div className="flex items-center justify-between pb-1 mb-3 border-b border-gray-200">
        <h4 className="m-0 text-red-600">Error Log ({errors.length})</h4>
        <button
          className="px-2 py-1 text-xs text-red-600 bg-transparent border border-red-600 rounded cursor-pointer hover:bg-red-50"
          onClick={onClear}
          data-testid="clear-errors-btn"
        >
          Clear
        </button>
      </div>
      <div className="error-log-content overflow-y-auto max-h-40">
        {errors.map((err, i) => (
          <div key={i} className="p-1 text-sm border-b border-gray-100" data-testid="error-entry">
            <div className="text-xs text-gray-500 mb-0.5">{new Date(err.timestamp).toLocaleTimeString()}</div>
            <div className="text-red-600">{err.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
