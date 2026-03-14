import type { PreloadOptions } from '../types/preload.js';
import { getThunkProcessorOptions, THUNK_PROCESSOR_DEFAULTS } from './thunkProcessor.js';

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
