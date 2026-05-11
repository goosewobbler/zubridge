import { debug } from '@zubridge/utils';

/**
 * Creates a handler that intentionally throws an error for testing error handling
 */
export const triggerMainProcessError = () => {
  return () => {
    debug('main:error', 'Intentionally throwing error in main process for testing');
    throw new Error('Intentional error thrown in main process for testing purposes');
  };
};
