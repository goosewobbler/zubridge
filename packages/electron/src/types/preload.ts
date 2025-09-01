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
export interface PreloadOptions {
  /**
   * Maximum number of pending actions allowed in the queue (default: 100)
   * When this limit is exceeded, new actions will throw a QueueOverflowError
   */
  maxQueueSize?: number;
  /**
   * Timeout for action completion in milliseconds
   * Platform-specific defaults: Linux=60000ms, others=30000ms
   */
  actionCompletionTimeoutMs?: number;
}

