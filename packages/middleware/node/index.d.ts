/**
 * Zubridge Middleware Framework for Node.js
 *
 * This module provides the Node.js bindings for the Zubridge middleware framework.
 */

/**
 * Configuration for the logging middleware
 */
export interface LoggingConfig {
  /** Whether logging is enabled */
  enabled?: boolean;

  /** Port for the WebSocket server (undefined to disable) */
  websocketPort?: number;

  /** Whether to output logs to console */
  consoleOutput?: boolean;

  /** Maximum number of log entries to keep in memory */
  logLimit?: number;
}

/**
 * Configuration for the Zubridge middleware
 */
export interface ZubridgeMiddlewareConfig {
  /** Configuration for the logging middleware */
  logging?: LoggingConfig;
}

/**
 * Represents any action that can be dispatched to modify state
 */
export interface Action {
  /** The type of action being performed */
  type: string;

  /** Optional payload data associated with the action */
  payload?: any;
}

/**
 * Zubridge middleware instance
 */
export interface ZubridgeMiddleware {
  /**
   * Process an action through the middleware pipeline
   * @param action The action to process
   */
  processAction(action: Action): Promise<void>;

  /**
   * Get the current state
   * @returns The current state
   */
  getState(): Promise<any>;

  /**
   * Set the entire state at once
   * @param state The new state
   */
  setState(state: any): Promise<void>;
}

/**
 * Initialize the Zubridge middleware with the specified configuration
 * @param config Configuration for the middleware
 * @returns A middleware instance
 */
export function initZubridgeMiddleware(config?: ZubridgeMiddlewareConfig): ZubridgeMiddleware;
