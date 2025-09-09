import type { PreloadOptions } from '../types/preload.js';
import type { ThunkProcessorOptions } from '../types/thunk.js';

// ===== Base Thunk Processor Configuration =====

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

// ===== Preload Configuration (extends base) =====

/**
 * Default configuration values for preload bridge
 * Extends base thunk processor defaults
 */
export const PRELOAD_DEFAULTS: Required<PreloadOptions> = {
  ...THUNK_PROCESSOR_DEFAULTS,
  // Add any preload-specific defaults here in the future
};

/**
 * Merge user options with preload defaults
 */
export function getPreloadOptions(userOptions?: PreloadOptions): Required<PreloadOptions> {
  // Use base thunk processor option merging, then add preload-specific handling
  const thunkProcessorOptions = getThunkProcessorOptions(userOptions);
  return {
    ...thunkProcessorOptions,
    // Add any preload-specific option handling here in the future
  };
}
