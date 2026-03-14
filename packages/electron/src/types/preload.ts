import type { ThunkProcessorOptions } from './thunkProcessor.js';

/**
 * Configuration options for preload bridge
 *
 * @example
 * ```typescript
 * // Configure with custom queue size and timeout
 * const options: PreloadOptions = {
 *   maxQueueSize: 50,        // Allow up to 50 pending actions
 *   actionCompletionTimeoutMs: 15000  // 15 second timeout
 * };
 *
 * // Use in preload
 * const bridge = preloadBridge<MyState>(options);
 * ```
 */
export type PreloadOptions = ThunkProcessorOptions;
