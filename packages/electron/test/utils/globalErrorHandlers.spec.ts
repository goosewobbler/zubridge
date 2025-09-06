import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ConfigurationError, ResourceManagementError } from '../../src/errors/index.js';
// Import and mock the error logging functions
import { logZubridgeError } from '../../src/utils/errorHandling.js';
import {
  cleanupGlobalErrorHandlers,
  setupMainProcessErrorHandlers,
  setupRendererErrorHandlers,
} from '../../src/utils/globalErrorHandlers.js';

vi.mock('../../src/utils/errorHandling.js', () => ({
  logZubridgeError: vi.fn(),
}));

// Mock the errors module
vi.mock('../../src/errors/index.js', () => ({
  ConfigurationError: vi.fn(),
  ResourceManagementError: vi.fn(),
  ensureZubridgeError: vi.fn(),
}));

// Mock the debug function
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

describe('Global Error Handlers', () => {
  let originalProcess: NodeJS.Process;
  let originalWindow: typeof global.window;

  beforeEach(() => {
    vi.clearAllMocks();
    originalProcess = global.process;
    originalWindow = global.window;

    // Reset process listeners
    if (global.process) {
      global.process.removeAllListeners('unhandledRejection');
      global.process.removeAllListeners('uncaughtException');
    }

    // Set up error constructor mocks
    (ConfigurationError as unknown as Mock).mockImplementation((message, context) => ({
      name: 'ConfigurationError',
      message,
      context,
    }));

    (ResourceManagementError as unknown as Mock).mockImplementation(
      (message, resource, operation, context) => ({
        name: 'ResourceManagementError',
        message,
        resource,
        operation,
        context,
      }),
    );
  });

  afterEach(() => {
    // Restore globals
    global.process = originalProcess;
    global.window = originalWindow;

    // Clean up any handlers
    cleanupGlobalErrorHandlers();
  });

  describe('setupMainProcessErrorHandlers', () => {
    it('should set up unhandled rejection handler', () => {
      const initialCount = process.listenerCount('unhandledRejection');

      setupMainProcessErrorHandlers();

      // The handler should have been set up
      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(initialCount);
    });

    it('should set up uncaught exception handler', () => {
      const initialCount = process.listenerCount('uncaughtException');

      setupMainProcessErrorHandlers();

      // The handler should have been set up
      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(initialCount);
    });

    it('should handle unhandled promise rejections', async () => {
      setupMainProcessErrorHandlers();

      const testError = new Error('Promise rejection test');
      const testPromise = Promise.reject(testError);

      // Trigger unhandled rejection
      process.emit('unhandledRejection', testError, testPromise);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(ResourceManagementError).toHaveBeenCalledWith(
        'Unhandled promise rejection detected',
        'promise',
        'cleanup',
        expect.objectContaining({
          reason: 'Promise rejection test',
          originalReason: testError,
          promiseString: expect.any(String),
        }),
      );

      expect(logZubridgeError).toHaveBeenCalled();
    });

    it('should handle uncaught exceptions', async () => {
      setupMainProcessErrorHandlers();

      const testError = new Error('Uncaught exception test');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        // Don't actually exit
        return undefined as never;
      });

      // Trigger uncaught exception
      process.emit('uncaughtException', testError);

      // Wait for event processing and setTimeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(ResourceManagementError).toHaveBeenCalledWith(
        'Uncaught exception detected',
        'process',
        'cleanup',
        expect.objectContaining({
          originalError: testError,
          stack: testError.stack,
        }),
      );

      expect(logZubridgeError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle string promise rejections', async () => {
      setupMainProcessErrorHandlers();

      const testReason = 'String rejection reason';
      const testPromise = Promise.reject(testReason);

      // Trigger unhandled rejection
      process.emit('unhandledRejection', testReason, testPromise);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(ResourceManagementError).toHaveBeenCalledWith(
        'Unhandled promise rejection detected',
        'promise',
        'cleanup',
        expect.objectContaining({
          reason: 'String rejection reason',
          originalReason: testReason,
        }),
      );
    });
  });

  describe('setupRendererErrorHandlers', () => {
    beforeEach(() => {
      // Set up window mock
      global.window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as Window & typeof globalThis;
    });

    it('should set up unhandled rejection handler for renderer', () => {
      setupRendererErrorHandlers();

      expect(window.addEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function),
      );
    });

    it('should set up error handler for renderer', () => {
      setupRendererErrorHandlers();

      expect(window.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should not set up handlers when window is undefined', () => {
      delete (global.window as unknown as Record<string, unknown>).window;

      expect(() => setupRendererErrorHandlers()).not.toThrow();
    });

    it('should handle unhandled promise rejections in renderer', () => {
      // Set up window mock
      global.window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as Window & typeof globalThis;

      setupRendererErrorHandlers();

      // Get the event handler
      const call = vi
        .mocked(window.addEventListener)
        .mock.calls.find(([event]) => event === 'unhandledrejection');

      expect(call).toBeDefined();
      const [, handler] = call ?? [];

      // Create a mock event
      const mockEvent = {
        reason: new Error('Renderer promise rejection'),
        preventDefault: vi.fn(),
      };

      // Trigger the event handler
      (handler as unknown as (event: unknown) => void)(mockEvent);

      expect(ConfigurationError).toHaveBeenCalledWith(
        'Unhandled promise rejection in renderer process',
        expect.objectContaining({
          reason: 'Renderer promise rejection',
          originalReason: mockEvent.reason,
        }),
      );

      expect(logZubridgeError).toHaveBeenCalled();
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('should handle uncaught errors in renderer', () => {
      // Set up window mock
      global.window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as Window & typeof globalThis;

      setupRendererErrorHandlers();

      // Get the event handler
      const call = vi
        .mocked(window.addEventListener)
        .mock.calls.find(([event]) => event === 'error');

      expect(call).toBeDefined();
      const [, handler] = call ?? [];

      // Create a mock event
      const mockError = new Error('Renderer error');
      const mockEvent = {
        message: 'Uncaught error in renderer',
        filename: 'test.js',
        lineno: 42,
        colno: 10,
        error: mockError,
        preventDefault: vi.fn(),
      };

      // Trigger the event handler
      (handler as unknown as (event: unknown) => void)(mockEvent);

      expect(ConfigurationError).toHaveBeenCalledWith(
        'Uncaught error in renderer process',
        expect.objectContaining({
          message: 'Uncaught error in renderer',
          filename: 'test.js',
          lineno: 42,
          colno: 10,
          originalError: mockError,
        }),
      );

      expect(logZubridgeError).toHaveBeenCalled();
    });

    it('should handle unhandled rejections with string reasons', () => {
      // Set up window mock
      global.window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as Window & typeof globalThis;

      setupRendererErrorHandlers();

      // Get the event handler
      const call = vi
        .mocked(window.addEventListener)
        .mock.calls.find(([event]) => event === 'unhandledrejection');

      expect(call).toBeDefined();
      const [, handler] = call ?? [];

      // Create a mock event with string reason
      const mockEvent = {
        reason: 'String rejection reason',
        preventDefault: vi.fn(),
      };

      // Trigger the event handler
      (handler as unknown as (event: unknown) => void)(mockEvent);

      expect(ConfigurationError).toHaveBeenCalledWith(
        'Unhandled promise rejection in renderer process',
        expect.objectContaining({
          reason: 'String rejection reason',
          originalReason: 'String rejection reason',
        }),
      );

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('should handle error events without error object', () => {
      // Set up window mock
      global.window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as Window & typeof globalThis;

      setupRendererErrorHandlers();

      // Get the event handler
      const call = vi
        .mocked(window.addEventListener)
        .mock.calls.find(([event]) => event === 'error');

      expect(call).toBeDefined();
      const [, handler] = call ?? [];

      // Create a mock event without error object
      const mockEvent = {
        message: 'Error without error object',
        filename: 'test.js',
        lineno: 100,
        colno: 5,
        error: null,
        preventDefault: vi.fn(),
      };

      // Trigger the event handler
      (handler as unknown as (event: unknown) => void)(mockEvent);

      expect(ConfigurationError).toHaveBeenCalledWith(
        'Uncaught error in renderer process',
        expect.objectContaining({
          message: 'Error without error object',
          filename: 'test.js',
          lineno: 100,
          colno: 5,
          originalError: null,
        }),
      );
    });
  });

  describe('cleanupGlobalErrorHandlers', () => {
    it('should handle missing process gracefully', () => {
      const originalProcess = global.process;
      delete (global.process as unknown as Record<string, unknown>).process;

      expect(() => cleanupGlobalErrorHandlers()).not.toThrow();

      global.process = originalProcess;
    });
  });
});
