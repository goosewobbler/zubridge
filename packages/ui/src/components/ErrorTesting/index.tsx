// No need to redeclare the window global since it's in @zubridge/types
import { useState, useCallback } from 'react';
import { debug } from '@zubridge/core';
// Import app window augmentations
import type {} from '@zubridge/types/app';
import type { Action, Dispatch } from '@zubridge/types';
import { Button } from '../Button';
import { ErrorLog } from '../ErrorLog';

interface ErrorTestingProps {
  dispatch: Dispatch<Action>;
  currentSubscriptions?: string[] | '*';
  onError?: (message: string) => void;
}

// Add a simple interface for state access
interface StateObject {
  counter?: number;
  theme?: { mode: string };
  [key: string]: any;
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

  const handleVerifyUnsubscribed = useCallback(() => {
    try {
      debug('ui', 'Verifying unsubscribed state behavior');

      // Access state and check what we're subscribed to
      if (!window.zubridge) {
        throw new Error('zubridge is not available');
      }

      const state = window.zubridge.getState() as StateObject;

      // Determine which key we're not subscribed to
      const isThemeSubscribed =
        currentSubscriptions === '*' || (Array.isArray(currentSubscriptions) && currentSubscriptions.includes('theme'));
      const isCounterSubscribed =
        currentSubscriptions === '*' ||
        (Array.isArray(currentSubscriptions) && currentSubscriptions.includes('counter'));

      // Choose a key we're not subscribed to (or counter if we're subscribed to everything)
      const keyToCheck = !isCounterSubscribed ? 'counter' : !isThemeSubscribed ? 'theme' : 'counter';

      debug('ui', `Checking access to ${keyToCheck} with subscriptions: ${JSON.stringify(currentSubscriptions)}`);

      const value = state[keyToCheck];
      const expectUndefined = keyToCheck === 'counter' ? !isCounterSubscribed : !isThemeSubscribed;

      if (expectUndefined && value !== undefined) {
        logError(
          `Subscription validation error: Key '${keyToCheck}' is defined as ${JSON.stringify(value)} ` +
            `when it should be undefined. Current subscriptions: ${JSON.stringify(currentSubscriptions)}`,
        );
      } else if (!expectUndefined && value === undefined) {
        logError(
          `Subscription validation error: Key '${keyToCheck}' is undefined ` +
            `when it should be defined. Current subscriptions: ${JSON.stringify(currentSubscriptions)}`,
        );
      } else {
        logError(
          `Subscription validation succeeded: Key '${keyToCheck}' is ${value === undefined ? 'undefined' : 'defined as ' + JSON.stringify(value)}, ` +
            `as expected with current subscriptions: ${JSON.stringify(currentSubscriptions)}`,
        );
      }
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }
  }, [currentSubscriptions, logError]);

  const handleDispatchInvalid = useCallback(async () => {
    try {
      debug('ui', 'Testing dispatch with invalid payload');

      // Create a non-serializable object with a function and symbol properties
      // This can't be serialized but won't crash React if rendered
      const nonSerializable = {
        id: Symbol('unique-id'),
        method: function () {
          return 'This is a function';
        },
        calculate: () => Math.random(),
        toString: function () {
          return '[Complex Object]';
        },
      };

      debug('ui', 'Attempting to dispatch with non-serializable payload');

      // Dispatch with the non-serializable object as payload
      await dispatch({
        type: 'COUNTER:SET',
        payload: nonSerializable,
      });

      // If we get here, no error was thrown
      debug('ui', 'Dispatch completed without error - this is unexpected');
      logError('Expected serialization error, but none occurred during dispatch');
    } catch (error) {
      logError(`Dispatch error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [dispatch, logError]);

  const handleTriggerMainError = useCallback(async () => {
    try {
      debug('ui', 'Triggering main process error');

      await dispatch('ERROR:TRIGGER_MAIN_PROCESS_ERROR');

      // We should never get here as the error should be caught above
      debug('ui', 'Main process error dispatch completed - check for async errors');
    } catch (error) {
      logError(`Main process error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [dispatch, logError]);

  const handleUpdateUnsubscribedState = useCallback(async () => {
    try {
      debug('ui', 'Attempting to update unsubscribed state');

      // Determine which key we're not subscribed to
      const isThemeSubscribed =
        currentSubscriptions === '*' || (Array.isArray(currentSubscriptions) && currentSubscriptions.includes('theme'));
      const isCounterSubscribed =
        currentSubscriptions === '*' ||
        (Array.isArray(currentSubscriptions) && currentSubscriptions.includes('counter'));

      // Choose a key we're not subscribed to (or counter if we're subscribed to everything)
      const targetKey = !isCounterSubscribed ? 'counter' : !isThemeSubscribed ? 'theme' : 'counter';
      const actionType = targetKey === 'counter' ? 'COUNTER:SET' : 'THEME:SET';
      const payload = targetKey === 'counter' ? 42 : 'dark';

      debug(`ui', 'Attempting to update ${targetKey} with action ${actionType}`);

      // Try to dispatch an action that updates unsubscribed state
      await dispatch({
        type: actionType,
        payload,
      });

      debug(
        'ui',
        `Successfully updated ${targetKey}. If this window is not subscribed to ${targetKey}, bypassAccessControl may be enabled.`,
      );
      logError(
        `Successfully updated ${targetKey} (${payload}). This window ${Array.isArray(currentSubscriptions) ? 'has subscriptions: ' + currentSubscriptions.join(', ') : 'subscription status: ' + currentSubscriptions}`,
      );
    } catch (error) {
      logError(`Access control error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [dispatch, currentSubscriptions, logError]);

  return (
    <div className="error-testing-container">
      <h3 className="mt-0 mb-3 text-lg font-semibold">Error Testing</h3>
      <div className="flex flex-wrap gap-2 error-buttons">
        <Button onClick={handleVerifyUnsubscribed} variant="close" data-testid="verify-unsubscribed-btn">
          Verify Unsubscribed
        </Button>
        <Button onClick={handleDispatchInvalid} variant="close" data-testid="dispatch-invalid-btn">
          Invalid Payload
        </Button>
        <Button onClick={handleTriggerMainError} variant="close" data-testid="trigger-main-error-btn">
          Main Process Error
        </Button>
        <Button onClick={handleUpdateUnsubscribedState} variant="close" data-testid="update-unsubscribed-btn">
          Update Unsubscribed
        </Button>
      </div>

      <ErrorLog errors={errors} onClear={clearErrors} />
    </div>
  );
}
