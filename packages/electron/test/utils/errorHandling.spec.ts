// Import debug function and mock it
import { debug } from '@zubridge/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZubridgeError } from '../../src/errors/index.js';
import { ensureZubridgeError } from '../../src/errors/index.js';
import { logError, logZubridgeError, serializeError } from '../../src/utils/errorHandling.js';

vi.mock('@zubridge/utils', () => ({
  debug: vi.fn(),
}));

// Mock the errors module
vi.mock('../../src/errors/index.js', () => ({
  ensureZubridgeError: vi.fn(),
  ZubridgeError: vi.fn(),
}));

describe('Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up ensureZubridgeError mock implementation
    ensureZubridgeError.mockImplementation((error: unknown) => {
      if (error instanceof Error) {
        const mockError = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          timestamp: Date.now(),
          context: undefined,
          getDetails: vi.fn().mockReturnValue({
            name: error.name,
            message: error.message,
            timestamp: expect.any(Number),
            context: undefined,
            stack: error.stack,
          }),
        };
        // Set the constructor name properly
        Object.defineProperty(mockError, 'constructor', {
          value: { name: error.name },
        });
        return mockError;
      }
      const mockError = {
        name: 'Error',
        message: String(error),
        stack: undefined,
        timestamp: Date.now(),
        context: {
          originalError: error,
          originalType: typeof error,
        },
        getDetails: vi.fn().mockReturnValue({
          name: 'Error',
          message: String(error),
          timestamp: expect.any(Number),
          context: {
            originalError: error,
            originalType: typeof error,
          },
          stack: undefined,
        }),
      };
      // Set the constructor name properly
      Object.defineProperty(mockError, 'constructor', {
        value: { name: 'Error' },
      });
      return mockError;
    });
  });

  describe('serializeError', () => {
    it('should serialize Error objects', () => {
      const error = new Error('Test error');
      const result = serializeError(error);

      expect(result).toEqual({
        name: 'Error',
        message: 'Test error',
        stack: expect.any(String),
        timestamp: expect.any(Number),
        context: undefined,
      });
    });

    it('should handle non-Error objects', () => {
      const error = 'String error message';
      const result = serializeError(error);

      expect(result).toEqual({
        name: 'Error',
        message: 'String error message',
        stack: undefined,
        timestamp: expect.any(Number),
        context: {
          originalError: 'String error message',
          originalType: 'string',
        },
      });
    });

    it('should handle null/undefined', () => {
      const result = serializeError(null);

      expect(result).toEqual({
        name: 'Error',
        message: 'null',
        stack: undefined,
        timestamp: expect.any(Number),
        context: {
          originalError: null,
          originalType: 'object',
        },
      });
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('No stack');
      error.stack = undefined;
      const result = serializeError(error);

      expect(result).toEqual({
        name: 'Error',
        message: 'No stack',
        stack: undefined,
        timestamp: expect.any(Number),
        context: undefined,
      });
    });
  });

  describe('logError', () => {
    it('should log error information with context', () => {
      const error = new Error('Test error');
      const context = 'test-context';
      const additionalInfo = { userId: 123 };

      logError(context, error, additionalInfo);

      expect(debug).toHaveBeenCalledWith(
        `${context}:error`,
        `Error in ${context}:`,
        expect.objectContaining({
          name: 'Error',
          message: 'Test error',
          timestamp: expect.any(Number),
          context: undefined,
          ...additionalInfo,
        }),
      );
    });

    it('should log error stack trace when available', () => {
      const error = new Error('Test error with stack');
      const context = 'test-context';

      logError(context, error);

      expect(debug).toHaveBeenCalledWith(
        `${context}:error`,
        'Stack trace:',
        expect.stringContaining('Test error with stack'),
      );
    });

    it('should handle non-Error objects', () => {
      const error = 'String error';
      const context = 'test-context';

      logError(context, error);

      expect(debug).toHaveBeenCalledWith(
        `${context}:error`,
        `Error in ${context}:`,
        expect.objectContaining({
          name: 'Error',
          message: 'String error',
          context: {
            originalError: 'String error',
            originalType: 'string',
          },
        }),
      );
    });

    it('should handle null and undefined', () => {
      const context = 'test-context';

      logError(context, null);

      expect(debug).toHaveBeenCalledWith(
        `${context}:error`,
        `Error in ${context}:`,
        expect.objectContaining({
          name: 'Error',
          message: 'null',
        }),
      );
    });

    it('should handle missing additional info', () => {
      const error = new Error('Test error');
      const context = 'test-context';

      logError(context, error);

      expect(debug).toHaveBeenCalledWith(
        `${context}:error`,
        `Error in ${context}:`,
        expect.objectContaining({
          name: 'Error',
          message: 'Test error',
        }),
      );
    });
  });

  describe('logZubridgeError', () => {
    it('should log ZubridgeError with details', () => {
      const mockError = {
        name: 'TestError',
        message: 'Test message',
        timestamp: Date.now(),
        context: { key: 'value' },
        getDetails: vi.fn().mockReturnValue({
          name: 'TestError',
          message: 'Test message',
          timestamp: expect.any(Number),
          context: { key: 'value' },
          stack: 'mock stack',
        }),
      } as unknown as ZubridgeError;

      logZubridgeError(mockError);

      expect(mockError.getDetails).toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(
        'object:error',
        'TestError:',
        expect.objectContaining({
          name: 'TestError',
          message: 'Test message',
        }),
      );
    });

    it('should include additional info when provided', () => {
      const mockError = {
        name: 'TestError',
        message: 'Test message',
        timestamp: Date.now(),
        context: undefined,
        getDetails: vi.fn().mockReturnValue({
          name: 'TestError',
          message: 'Test message',
          timestamp: expect.any(Number),
          context: undefined,
        }),
      } as unknown as ZubridgeError;

      const additionalInfo = { requestId: 'req-123' };

      logZubridgeError(mockError, additionalInfo);

      expect(debug).toHaveBeenCalledWith(
        'object:error',
        'TestError:',
        expect.objectContaining({
          name: 'TestError',
          message: 'Test message',
          ...additionalInfo,
        }),
      );
    });

    it('should handle error names with multiple words', () => {
      const mockError = {
        name: 'ActionProcessingError',
        message: 'Processing failed',
        timestamp: Date.now(),
        context: undefined,
        getDetails: vi.fn().mockReturnValue({
          name: 'ActionProcessingError',
          message: 'Processing failed',
          timestamp: expect.any(Number),
          context: undefined,
        }),
      } as unknown as ZubridgeError;

      logZubridgeError(mockError);

      expect(debug).toHaveBeenCalledWith(
        'object:error',
        'ActionProcessingError:',
        expect.any(Object),
      );
    });

    it('should handle errors without Error suffix', () => {
      const mockError = {
        name: 'CustomError',
        message: 'Custom error',
        timestamp: Date.now(),
        context: undefined,
        getDetails: vi.fn().mockReturnValue({
          name: 'CustomError',
          message: 'Custom error',
          timestamp: expect.any(Number),
          context: undefined,
        }),
      } as unknown as ZubridgeError;

      logZubridgeError(mockError);

      expect(debug).toHaveBeenCalledWith('object:error', 'CustomError:', expect.any(Object));
    });
  });
});
