import type { PreloadOptions } from '../types/preload.js';

/**
 * Default configuration values for preload bridge
 */
export const PRELOAD_DEFAULTS: Required<PreloadOptions> = {
  /** Default maximum queue size */
  maxQueueSize: 100,
  /** Platform-specific timeout - Linux gets longer timeout due to slower IPC */
  actionCompletionTimeoutMs: process.platform === 'linux' ? 60000 : 30000,
};

/**
 * Merge user options with defaults
 */
export function getPreloadOptions(userOptions?: PreloadOptions): Required<PreloadOptions> {
  return {
    maxQueueSize: userOptions?.maxQueueSize ?? PRELOAD_DEFAULTS.maxQueueSize,
    actionCompletionTimeoutMs:
      userOptions?.actionCompletionTimeoutMs ?? PRELOAD_DEFAULTS.actionCompletionTimeoutMs,
  };
}
