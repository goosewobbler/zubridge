import { debug } from '@zubridge/utils';
import { ConfigurationError, ResourceManagementError } from '../errors/index.js';
import { logZubridgeError } from './errorHandling.js';

/**
 * Sets up global error handlers for the main process to catch unhandled errors
 * and promise rejections that could otherwise crash the application
 */
export function setupMainProcessErrorHandlers(): void {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    const error = new ResourceManagementError(
      'Unhandled promise rejection detected',
      'promise',
      'cleanup',
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        originalReason: reason,
        promiseString: promise.toString(),
      },
    );

    logZubridgeError(error);
    debug('process:error', 'Unhandled promise rejection detected and logged');
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    const wrappedError = new ResourceManagementError(
      'Uncaught exception detected',
      'process',
      'cleanup',
      {
        originalError: error,
        stack: error.stack,
      },
    );

    logZubridgeError(wrappedError);
    debug('process:error', 'Uncaught exception detected and logged');

    // For uncaught exceptions, we should exit gracefully
    // Give some time for logging to complete before exiting
    setTimeout(() => {
      process.exit(1);
    }, 100);
  });

  debug('process', 'Global error handlers setup for main process');
}

/**
 * Sets up error handlers for the renderer process
 */
export function setupRendererErrorHandlers(): void {
  // Handle unhandled promise rejections in renderer
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      const error = new ConfigurationError('Unhandled promise rejection in renderer process', {
        reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
        originalReason: event.reason,
      });

      logZubridgeError(error);
      debug('renderer:error', 'Unhandled promise rejection detected and logged');

      // Prevent the default browser handling (which would log to console)
      event.preventDefault();
    });

    // Handle uncaught errors in renderer
    window.addEventListener('error', (event) => {
      const error = new ConfigurationError('Uncaught error in renderer process', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        originalError: event.error,
      });

      logZubridgeError(error);
      debug('renderer:error', 'Uncaught error detected and logged');
    });

    debug('renderer', 'Global error handlers setup for renderer process');
  }
}

/**
 * Cleans up global error handlers (useful for testing)
 */
export function cleanupGlobalErrorHandlers(): void {
  if (typeof process !== 'undefined') {
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('uncaughtException');
    debug('process', 'Global error handlers cleaned up for main process');
  }

  if (typeof window !== 'undefined') {
    // Note: We can't easily remove specific listeners without references,
    // but this is primarily for testing scenarios
    debug('renderer', 'Global error handlers cleanup requested for renderer');
  }
}
