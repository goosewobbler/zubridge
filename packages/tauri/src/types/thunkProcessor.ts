export interface ThunkProcessorOptions {
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
