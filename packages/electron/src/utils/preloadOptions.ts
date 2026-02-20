import type { BatchingConfig } from '../batching/types.js';
import { BATCHING_DEFAULTS } from '../batching/types.js';
import type { PreloadOptions } from '../types/preload.js';
import { getThunkProcessorOptions, THUNK_PROCESSOR_DEFAULTS } from './thunkProcessor.js';

/**
 * Get batching configuration with defaults
 */
export function getBatchingConfig(userConfig?: Partial<BatchingConfig>): Required<BatchingConfig> {
  return {
    windowMs: userConfig?.windowMs ?? BATCHING_DEFAULTS.windowMs,
    maxBatchSize: userConfig?.maxBatchSize ?? BATCHING_DEFAULTS.maxBatchSize,
    priorityFlushThreshold:
      userConfig?.priorityFlushThreshold ?? BATCHING_DEFAULTS.priorityFlushThreshold,
  };
}

/**
 * Default configuration values for preload bridge
 * Extends base thunk processor defaults
 */
export const PRELOAD_DEFAULTS: Required<PreloadOptions> = {
  ...THUNK_PROCESSOR_DEFAULTS,
  enableBatching: true,
  batching: {},
};

/**
 * Merge user options with preload defaults
 */
export function getPreloadOptions(userOptions?: PreloadOptions): Required<PreloadOptions> {
  const thunkProcessorOptions = getThunkProcessorOptions(userOptions);
  return {
    ...thunkProcessorOptions,
    enableBatching: userOptions?.enableBatching ?? PRELOAD_DEFAULTS.enableBatching,
    batching: userOptions?.batching ?? {},
  };
}
