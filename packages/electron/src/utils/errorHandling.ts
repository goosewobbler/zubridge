import { debug } from '@zubridge/utils';
import { ensureZubridgeError, type ZubridgeError } from '../errors/index.js';

/**
 * Logs error information in a consistent format using proper Error classes
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>,
): void {
  const zubridgeError = ensureZubridgeError(error);

  debug(`${context}:error`, `Error in ${context}:`, {
    name: zubridgeError.name,
    message: zubridgeError.message,
    timestamp: zubridgeError.timestamp,
    context: zubridgeError.context,
    ...additionalInfo,
  });

  if (zubridgeError.stack) {
    debug(`${context}:error`, 'Stack trace:', zubridgeError.stack);
  }
}

/**
 * Enhanced error logging that preserves Error instances
 */
export function logZubridgeError(
  error: ZubridgeError,
  additionalInfo?: Record<string, unknown>,
): void {
  const contextName = error.constructor.name.replace('Error', '').toLowerCase();

  debug(`${contextName}:error`, `${error.name}:`, {
    ...error.getDetails(),
    ...additionalInfo,
  });
}

/**
 * Convert error to serializable format for IPC without losing type info
 */
export function serializeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  timestamp: number;
  context?: Record<string, unknown>;
} {
  const zubridgeError = ensureZubridgeError(error);

  return {
    name: zubridgeError.name,
    message: zubridgeError.message,
    stack: zubridgeError.stack,
    timestamp: zubridgeError.timestamp,
    context: zubridgeError.context,
  };
}
