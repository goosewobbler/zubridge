import type { ThunkProcessorOptions } from '../types/thunkProcessor.js';

/**
 * Base default configuration values for thunk processors
 */
export const THUNK_PROCESSOR_DEFAULTS: Required<ThunkProcessorOptions> = {
  /** Default maximum queue size */
  maxQueueSize: 100,
  /** Platform-specific timeout - Linux gets longer timeout due to slower IPC */
  actionCompletionTimeoutMs: process.platform === 'linux' ? 60000 : 30000,
};

/**
 * Merge user options with thunk processor defaults
 */
export function getThunkProcessorOptions(
  userOptions?: ThunkProcessorOptions,
): Required<ThunkProcessorOptions> {
  return {
    maxQueueSize: userOptions?.maxQueueSize ?? THUNK_PROCESSOR_DEFAULTS.maxQueueSize,
    actionCompletionTimeoutMs:
      userOptions?.actionCompletionTimeoutMs ?? THUNK_PROCESSOR_DEFAULTS.actionCompletionTimeoutMs,
  };
}
