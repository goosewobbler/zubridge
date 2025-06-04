// No need to redeclare the window global since it's in @zubridge/types
import { useState, useCallback } from 'react';
import { debug } from '@zubridge/core';
// Import app window augmentations
import type {} from '@zubridge/types/app';
import { Button } from '../Button';

interface ErrorLogProps {
  errors: Array<{ message: string; timestamp: number }>;
  onClear: () => void;
}

function ErrorLog({ errors, onClear }: ErrorLogProps) {
  if (errors.length === 0) {
    return (
      <div className="error-log empty" data-testid="error-log">
        No errors logged
      </div>
    );
  }

  return (
    <div className="error-log" data-testid="error-log">
      <div className="error-log-header">
        <h4>Error Log ({errors.length})</h4>
        <Button onClick={onClear} variant="reset" size="sm" data-testid="clear-errors-btn">
          Clear
        </Button>
      </div>
      <div className="error-log-content">
        {errors.map((err, i) => (
          <div key={i} className="error-entry" data-testid="error-entry">
            <div className="error-time">{new Date(err.timestamp).toLocaleTimeString()}</div>
            <div className="error-message">{err.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ErrorTestingProps {
  dispatch: any;
  currentSubscriptions?: string[] | '*';
  onError?: (message: string) => void;
}

export function ErrorTesting({ dispatch, currentSubscriptions = '*', onError }: ErrorTestingProps) {
  const [errors, setErrors] = useState<Array<{ message: string; timestamp: number }>>([]);

  const logError = useCallback(
    (message: string) => {
      debug('ui:error', message);
      setErrors((prev) => [...prev, { message, timestamp: Date.now() }]);
      if (onError) {
        onError(message);
      }
    },
    [onError],
  );

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const handleAccessUnsubscribed = useCallback(() => {
    try {
      // Try to directly access a state key we're not subscribed to
      if (window.zubridge && typeof window.zubridge.getState === 'function') {
        // Check current subscriptions to find something we're not subscribed to
        const targetKey =
          typeof currentSubscriptions === 'string'
            ? 'nonExistentKey'
            : currentSubscriptions.includes('counter')
              ? 'nonExistentKey'
              : 'counter';

        const state = window.zubridge.getState();

        // Using any here because we're deliberately accessing properties that might not exist
        // to trigger errors for testing
        const value = (state as any)[targetKey];
        debug('ui', `Successfully accessed ${targetKey}: ${value}`);
      } else {
        throw new Error('zubridge.getState is not available');
      }
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [currentSubscriptions, logError]);

  const handleDispatchInvalid = useCallback(() => {
    try {
      // Try to dispatch an action with invalid payload
      dispatch({
        type: 'COUNTER:SET',
        payload: { invalidPayloadStructure: true },
      });
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [dispatch, logError]);

  const handleAccessNonexistent = useCallback(() => {
    try {
      // Try to access a non-existent nested property
      if (window.zubridge && typeof window.zubridge.getState === 'function') {
        const state = window.zubridge.getState();

        // Using any to allow accessing non-existent properties to trigger errors
        // This is intentional for testing error handling
        const counter = (state as any).counter;
        if (counter) {
          const value = (counter as any).nonExistentProperty?.deeplyNested;
          debug('ui', `Successfully accessed nested property: ${value}`);
        } else {
          throw new Error('Counter property does not exist in state');
        }
      } else {
        throw new Error('zubridge.getState is not available');
      }
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [logError]);

  return (
    <div className="error-testing-container">
      <h3>Error Testing</h3>
      <div className="error-buttons flex flex-wrap gap-2">
        <Button onClick={handleAccessUnsubscribed} variant="close" data-testid="access-unsubscribed-btn">
          Access Unsubscribed
        </Button>
        <Button onClick={handleDispatchInvalid} variant="close" data-testid="dispatch-invalid-btn">
          Dispatch Invalid
        </Button>
        <Button onClick={handleAccessNonexistent} variant="close" data-testid="access-nonexistent-btn">
          Access Non-existent
        </Button>
      </div>

      <ErrorLog errors={errors} onClear={clearErrors} />
    </div>
  );
}
