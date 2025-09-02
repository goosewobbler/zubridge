/**
 * Custom Error classes for different areas of the Zubridge application
 * Provides better type safety, debugging, and error handling
 */

/**
 * Base class for all Zubridge errors
 */
export abstract class ZubridgeError extends Error {
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.context = context;

    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get error details for logging
   */
  getDetails(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Errors related to IPC communication between main and renderer processes
 */
export class IpcCommunicationError extends ZubridgeError {
  public readonly channel?: string;
  public readonly windowId?: number;

  constructor(
    message: string,
    context?: { channel?: string; windowId?: number; [key: string]: unknown },
  ) {
    super(message, context);
    this.channel = context?.channel;
    this.windowId = context?.windowId;
  }
}

/**
 * Errors related to thunk execution and management
 */
export class ThunkExecutionError extends ZubridgeError {
  public readonly thunkId?: string;
  public readonly actionType?: string;
  public readonly phase: 'registration' | 'execution' | 'completion';

  constructor(
    message: string,
    phase: 'registration' | 'execution' | 'completion',
    context?: { thunkId?: string; actionType?: string; [key: string]: unknown },
  ) {
    super(message, context);
    this.thunkId = context?.thunkId;
    this.actionType = context?.actionType;
    this.phase = phase;
  }
}

/**
 * Errors related to action processing in adapters
 */
export class ActionProcessingError extends ZubridgeError {
  public readonly actionType: string;
  public readonly adapter: 'redux' | 'zustand';
  public readonly handlerName?: string;

  constructor(
    message: string,
    actionType: string,
    adapter: 'redux' | 'zustand',
    context?: { handlerName?: string; [key: string]: unknown },
  ) {
    super(message, context);
    this.actionType = actionType;
    this.adapter = adapter;
    this.handlerName = context?.handlerName;
  }
}

/**
 * Errors related to subscription management
 */
export class SubscriptionError extends ZubridgeError {
  public readonly windowId?: number;
  public readonly keys?: string[];
  public readonly operation: 'subscribe' | 'unsubscribe' | 'notify';

  constructor(
    message: string,
    operation: 'subscribe' | 'unsubscribe' | 'notify',
    context?: { windowId?: number; keys?: string[]; [key: string]: unknown },
  ) {
    super(message, context);
    this.windowId = context?.windowId;
    this.keys = context?.keys;
    this.operation = operation;
  }
}

/**
 * Errors related to resource management and cleanup
 */
export class ResourceManagementError extends ZubridgeError {
  public readonly resourceType: string;
  public readonly operation: 'create' | 'cleanup' | 'destroy' | 'enqueue' | 'overflow';

  constructor(
    message: string,
    resourceType: string,
    operation: 'create' | 'cleanup' | 'destroy' | 'enqueue' | 'overflow',
    context?: Record<string, unknown>,
  ) {
    super(message, context);
    this.resourceType = resourceType;
    this.operation = operation;
  }
}

/**
 * Errors related to handler resolution and caching
 */
export class HandlerResolutionError extends ZubridgeError {
  public readonly actionType: string;
  public readonly phase: 'resolution' | 'cache' | 'execution';

  constructor(
    message: string,
    actionType: string,
    phase: 'resolution' | 'cache' | 'execution',
    context?: Record<string, unknown>,
  ) {
    super(message, context);
    this.actionType = actionType;
    this.phase = phase;
  }
}

/**
 * Errors related to configuration and validation
 */
export class ConfigurationError extends ZubridgeError {
  public readonly configPath?: string;
  public readonly expectedType?: string;
  public readonly actualType?: string;

  constructor(
    message: string,
    context?: {
      configPath?: string;
      expectedType?: string;
      actualType?: string;
      [key: string]: unknown;
    },
  ) {
    super(message, context);
    this.configPath = context?.configPath;
    this.expectedType = context?.expectedType;
    this.actualType = context?.actualType;
  }
}

/**
 * Type guard to check if an error is a ZubridgeError
 */
export function isZubridgeError(error: unknown): error is ZubridgeError {
  return error instanceof ZubridgeError;
}

/**
 * Type guard to check if an error is a specific Zubridge error type
 */
export function isErrorOfType<T extends ZubridgeError>(
  error: unknown,
  ErrorClass: new (...args: unknown[]) => T,
): error is T {
  return error instanceof ErrorClass;
}

/**
 * Convert any error to a ZubridgeError if it's not already one
 */
export function ensureZubridgeError(
  error: unknown,
  fallbackMessage = 'Unknown error',
): ZubridgeError {
  if (isZubridgeError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Wrap existing Error in a ZubridgeError while preserving info
    const originalError = error;
    return new (class extends ZubridgeError {
      constructor() {
        super(originalError.message);
        this.name = originalError.name;
        this.stack = originalError.stack;
      }
    })();
  }

  // Convert other types to ZubridgeError
  const errorMessage = typeof error === 'string' ? error : fallbackMessage;
  return new (class extends ZubridgeError {
    constructor() {
      super(errorMessage, {
        originalError: error,
        originalType: typeof error,
      });
    }
  })();
}
