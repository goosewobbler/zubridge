/**
 * Custom Error classes for the Zubridge Tauri integration. Mirrors the
 * @zubridge/electron error registry except that Electron's
 * `IpcCommunicationError` is replaced with `TauriCommandError` to reflect the
 * different transport.
 */

export abstract class ZubridgeError extends Error {
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.context = context;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

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
 * Errors raised when invoking or listening to Tauri commands/events.
 */
export class TauriCommandError extends ZubridgeError {
  public readonly command?: string;
  public readonly sourceLabel?: string;

  constructor(
    message: string,
    context?: { command?: string; sourceLabel?: string; [key: string]: unknown },
  ) {
    super(message, context);
    this.command = context?.command;
    this.sourceLabel = context?.sourceLabel;
  }
}

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

export class ActionProcessingError extends ZubridgeError {
  public readonly actionType: string;
  public readonly adapter: 'redux' | 'zustand' | 'tauri';
  public readonly handlerName?: string;

  constructor(
    message: string,
    actionType: string,
    adapter: 'redux' | 'zustand' | 'tauri',
    context?: { handlerName?: string; [key: string]: unknown },
  ) {
    super(message, context);
    this.actionType = actionType;
    this.adapter = adapter;
    this.handlerName = context?.handlerName;
  }
}

export class SubscriptionError extends ZubridgeError {
  public readonly sourceLabel?: string;
  public readonly keys?: string[];
  public readonly operation: 'subscribe' | 'unsubscribe' | 'notify';

  constructor(
    message: string,
    operation: 'subscribe' | 'unsubscribe' | 'notify',
    context?: { sourceLabel?: string; keys?: string[]; [key: string]: unknown },
  ) {
    super(message, context);
    this.sourceLabel = context?.sourceLabel;
    this.keys = context?.keys;
    this.operation = operation;
  }
}

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

export function isZubridgeError(error: unknown): error is ZubridgeError {
  return error instanceof ZubridgeError;
}

export function isErrorOfType<T extends ZubridgeError>(
  error: unknown,
  ErrorClass: new (...args: unknown[]) => T,
): error is T {
  return error instanceof ErrorClass;
}

export function ensureZubridgeError(
  error: unknown,
  fallbackMessage = 'Unknown error',
): ZubridgeError {
  if (isZubridgeError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const originalError = error;
    return new (class extends ZubridgeError {
      constructor() {
        super(originalError.message);
        this.name = originalError.name;
        this.stack = originalError.stack;
      }
    })();
  }

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
