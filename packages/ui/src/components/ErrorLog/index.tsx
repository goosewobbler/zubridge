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
      <div className="error-log-content">
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

export interface ErrorTestingProps {
  dispatch: any;
  onError?: (message: string) => void;
}

export function ErrorTesting({ dispatch, onError }: ErrorTestingProps) {
  const handleError = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      debug('ui:error', message);
      if (onError) {
        onError(message);
      }
    },
    [onError],
  );

  const handleAccessUnsubscribed = useCallback(() => {
    try {
      // This will be handled by the error boundary or caught in the bridge
      dispatch('TEST:ACCESS_UNSUBSCRIBED');
    } catch (error) {
      handleError(error);
    }
  }, [dispatch, handleError]);

  const handleDispatchInvalid = useCallback(() => {
    try {
      // Try to dispatch an action with invalid payload
      dispatch({
        type: 'COUNTER:SET',
        payload: { invalidPayloadStructure: true },
      });
    } catch (error) {
      handleError(error);
    }
  }, [dispatch, handleError]);

  return (
    <div className="flex gap-3 mb-4">
      <button
        className="px-4 py-2 text-sm text-white transition-colors bg-red-500 border-0 rounded cursor-pointer hover:bg-red-600"
        onClick={handleAccessUnsubscribed}
        data-testid="access-unsubscribed-btn"
      >
        Access Unsubscribed
      </button>
      <button
        className="px-4 py-2 text-sm text-white transition-colors bg-red-500 border-0 rounded cursor-pointer hover:bg-red-600"
        onClick={handleDispatchInvalid}
        data-testid="dispatch-invalid-btn"
      >
        Dispatch Invalid
      </button>
    </div>
  );
}
