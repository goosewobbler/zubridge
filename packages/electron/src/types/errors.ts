/**
 * Error thrown when the action queue exceeds its maximum size
 *
 * This error indicates that the application is generating actions faster than
 * they can be processed, which could lead to memory issues or performance degradation.
 *
 * @example
 * ```typescript
 * import { QueueOverflowError } from '@zubridge/electron';
 *
 * try {
 *   await dispatch(someAction);
 * } catch (error) {
 *   if (error instanceof QueueOverflowError) {
 *     console.error('Action queue is full:', error.message);
 *     // Handle overflow - maybe wait and retry, or warn user
 *   }
 * }
 * ```
 */
export class QueueOverflowError extends Error {
  public readonly queueSize: number;
  public readonly maxSize: number;

  constructor(queueSize: number, maxSize: number) {
    super(`Action queue overflow: ${queueSize} actions pending, maximum allowed is ${maxSize}`);
    this.name = 'QueueOverflowError';
    this.queueSize = queueSize;
    this.maxSize = maxSize;
  }
}
