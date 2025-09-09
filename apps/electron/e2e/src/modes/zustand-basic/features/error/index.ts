import { debug } from '@zubridge/core';
import type { StoreApi } from 'zustand';
import type { BaseState } from '../../../../types.js';

/**
 * Creates a handler that intentionally throws an error for testing error handling
 */
export const triggerMainProcessError = () => {
  return () => {
    debug('main:error', 'Intentionally throwing error in main process for testing');
    throw new Error('Intentional error thrown in main process for testing purposes');
  };
};

export const attachErrorHandlers = <S extends BaseState>(store: StoreApi<S>) => {
  store.setState((state) => ({
    ...state,
    'ERROR:TRIGGER_MAIN_PROCESS_ERROR': triggerMainProcessError(),
  }));
};
