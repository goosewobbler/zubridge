import type { Reducer } from '@zubridge/electron';

/**
 * Creates a handler that intentionally throws an error for testing error handling
 */
const triggerMainProcessError = () => {
  console.log('Intentionally throwing error in main process for testing');
  throw new Error('Intentional error thrown in main process for testing purposes');
};

export const reducer: Reducer<undefined> = (state, _action) => {
  triggerMainProcessError();
  return state;
};
