import { debug } from '@zubridge/core';
import type { BaseState } from '../../../../types.js';

/**
 * Creates a handler that intentionally throws an error for testing error handling
 */
export const triggerMainProcessError = <S extends BaseState>() => {
  return () => {
    debug('main:error', 'Intentionally throwing error in main process for testing');
    throw new Error('Intentional error thrown in main process for testing purposes');
  };
};
