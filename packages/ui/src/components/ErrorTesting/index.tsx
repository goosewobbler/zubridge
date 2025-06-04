// No need to redeclare the window global since it's in @zubridge/types
import { useState, useCallback } from 'react';
import { debug } from '@zubridge/core';
// Import app window augmentations
import type {} from '@zubridge/types/app';
import { Button } from '../Button';
import { ErrorLog } from '../ErrorLog';

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
      debug('ui', 'Testing access to unsubscribed state');

      // Force an error by attempting to access a state key we're not subscribed to
      if (!window.zubridge) {
        throw new Error('zubridge is not available');
      }

      // Instead of trying to check what we're subscribed to,
      // let's just try to access a state property that doesn't exist
      const nonExistentKey = 'nonExistentKey_' + Date.now();
      debug('ui', `Attempting to access nonexistent key: ${nonExistentKey}`);

      // Try to dispatch an action for a state we're not subscribed to
      dispatch({
        type: 'TEST:ACCESS_UNSUBSCRIBED',
        payload: { targetKey: nonExistentKey },
        __testErrorTrigger: true,
      });

      logError(
        `Successfully accessed unsubscribed state (${nonExistentKey}). This should have failed if access control is working.`,
      );
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [dispatch, logError]);

  const handleDispatchInvalid = useCallback(() => {
    try {
      debug('ui', 'Testing dispatch with invalid payload');

      // Use a string value that's invalid for the counter
      // This should cause an error in the reducer but won't crash React
      dispatch({
        type: 'COUNTER:SET',
        payload: 'not-a-number',
      });

      // If we get here, no error was thrown synchronously
      debug('ui', 'Dispatch completed - check for async errors');
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [dispatch, logError]);

  const handleAccessNonexistent = useCallback(() => {
    try {
      debug('ui', 'Testing access to non-existent nested property');

      // Try to access a non-existent nested property
      if (!window.zubridge || typeof window.zubridge.getState !== 'function') {
        throw new Error('zubridge.getState is not available');
      }

      const state = window.zubridge.getState();

      // Using any to allow accessing non-existent properties to trigger errors
      // This is intentional for testing error handling
      const nonExistentValue = (state as any).nonExistentProperty?.deeplyNested?.evenDeeper;

      // If we reach here without an error, log it
      debug('ui', `Successfully accessed deeply nested non-existent property: ${nonExistentValue}`);
      logError('Expected an error when accessing non-existent property, but none occurred');
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [logError]);

  return (
    <div className="error-testing-container">
      <h3 className="mt-0 mb-3 text-lg font-semibold">Error Testing</h3>
      <div className="flex flex-wrap gap-2 error-buttons">
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
