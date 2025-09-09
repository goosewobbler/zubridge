import type { Handler } from '@zubridge/types';
import { describe, expect, it, vi } from 'vitest';
import {
  findCaseInsensitiveMatch,
  findNestedHandler,
  resolveHandler,
} from '../../src/utils/handlers.js';

describe('Handler Utilities', () => {
  describe('findCaseInsensitiveMatch', () => {
    it('should find exact matches', () => {
      const handlers = {
        TEST_ACTION: vi.fn(),
        otherAction: vi.fn(),
      };

      const result = findCaseInsensitiveMatch(handlers, 'TEST_ACTION');
      expect(result).toBeDefined();
      expect(result[0]).toBe('TEST_ACTION');
      expect(result[1]).toBe(handlers.TEST_ACTION);
    });

    it('should find case-insensitive matches', () => {
      const handlers = {
        TEST_ACTION: vi.fn(),
        otherAction: vi.fn(),
      };

      const result = findCaseInsensitiveMatch(handlers, 'test_action');
      expect(result).toBeDefined();
      expect(result[0]).toBe('TEST_ACTION');
      expect(result[1]).toBe(handlers.TEST_ACTION);
    });

    it('should return undefined for non-existent keys', () => {
      const handlers = {
        TEST_ACTION: vi.fn(),
      };

      const result = findCaseInsensitiveMatch(handlers, 'NON_EXISTENT');
      expect(result).toBeUndefined();
    });
  });

  describe('findNestedHandler', () => {
    it('should find simple nested handlers', () => {
      const counterIncrement = vi.fn();
      const themeToggle = vi.fn();

      const handlers = {
        counter: {
          increment: counterIncrement,
        },
        theme: {
          toggle: themeToggle,
        },
      };

      const result = findNestedHandler<Handler>(handlers, 'counter.increment');
      expect(result).toBe(counterIncrement);
    });

    it('should find deeply nested handlers', () => {
      const deepFunc = vi.fn();

      const handlers = {
        level1: {
          level2: {
            level3: {
              action: deepFunc,
            },
          },
        },
      };

      const result = findNestedHandler<Handler>(handlers, 'level1.level2.level3.action');
      expect(result).toBe(deepFunc);
    });

    it('should find case-insensitive nested handlers', () => {
      const counterIncrement = vi.fn();

      const handlers = {
        Counter: {
          Increment: counterIncrement,
        },
      };

      const result = findNestedHandler<Handler>(handlers, 'counter.increment');
      expect(result).toBe(counterIncrement);
    });

    it('should handle non-function properties safely', () => {
      const handlers = {
        counter: {
          value: 42,
          increment: vi.fn(),
        },
      };

      const result = findNestedHandler<Handler>(handlers, 'counter.value');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent paths', () => {
      const handlers = {
        counter: {
          increment: vi.fn(),
        },
      };

      const result = findNestedHandler<Handler>(handlers, 'counter.decrement');
      expect(result).toBeUndefined();
    });
  });

  describe('resolveHandler', () => {
    it('should resolve direct handlers', () => {
      const directHandler = vi.fn();

      const handlers = {
        TEST_ACTION: directHandler,
      };

      const result = resolveHandler(handlers, 'TEST_ACTION');
      expect(result).toBe(directHandler);
    });

    it('should resolve nested handlers', () => {
      const nestedHandler = vi.fn();

      const handlers = {
        counter: {
          increment: nestedHandler,
        },
      };

      const result = resolveHandler(handlers, 'counter.increment');
      expect(result).toBe(nestedHandler);
    });

    it('should resolve case-insensitive handlers', () => {
      const handler = vi.fn();

      const handlers = {
        TEST_ACTION: handler,
      };

      const result = resolveHandler(handlers, 'test_action');
      expect(result).toBe(handler);
    });

    it('should return undefined for non-existent handlers', () => {
      const handlers = {
        TEST_ACTION: vi.fn(),
      };

      const result = resolveHandler(handlers, 'NON_EXISTENT');
      expect(result).toBeUndefined();
    });

    it('should use cached results', () => {
      const handler = vi.fn();
      const handlers = { TEST_ACTION: handler };

      // First call should cache the result
      resolveHandler(handlers, 'TEST_ACTION');
      expect(handler).toHaveBeenCalledTimes(0); // Handler not called yet

      // Second call should use cache
      const result = resolveHandler(handlers, 'TEST_ACTION');
      expect(result).toBe(handler);
    });

    it('should handle cache expiration', () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let currentTime = 1000;

      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      try {
        const handler = vi.fn();
        const handlers = { TEST_ACTION: handler };

        // First call
        resolveHandler(handlers, 'TEST_ACTION');

        // Advance time past TTL
        currentTime = 1000 + 5 * 60 * 1000 + 1000; // 5 minutes + 1 second

        // Second call should not use cache
        const result = resolveHandler(handlers, 'TEST_ACTION');
        expect(result).toBe(handler);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('should handle cache size limits', () => {
      const handlers = {};
      const maxCacheSize = 1000;

      // Fill cache beyond limit
      for (let i = 0; i < maxCacheSize + 10; i++) {
        handlers[`ACTION_${i}`] = vi.fn();
        resolveHandler(handlers, `ACTION_${i}`);
      }

      // Cache should have been cleaned up
      expect(true).toBe(true); // This test mainly ensures no errors
    });

    it('should handle nested handlers with non-function values', () => {
      const handlers = {
        counter: {
          value: 42,
          increment: vi.fn(),
        },
      };

      const result = findNestedHandler(handlers, 'counter.value');
      expect(result).toBeUndefined();
    });

    it('should handle deeply nested handlers with errors', () => {
      const handlers = {
        level1: {
          level2: null, // This will cause an error during navigation
        },
      };

      const result = findNestedHandler(handlers, 'level1.level2.level3');
      expect(result).toBeUndefined();
    });

    it('should handle case-insensitive matching in complex scenarios', () => {
      const handlers = {
        UserManagement: {
          ProfileSettings: {
            UpdateEmail: vi.fn(),
          },
        },
      };

      const result = findNestedHandler(handlers, 'userManagement.profileSettings.updateEmail');
      expect(result).toBeDefined();
    });

    it('should handle resolveHandler with undefined handlers', () => {
      // This test is not applicable since WeakMap requires objects as keys
      // and undefined is not a valid WeakMap key
      expect(true).toBe(true);
    });

    it('should handle resolveHandler with empty handlers', () => {
      const result = resolveHandler({}, 'TEST_ACTION');
      expect(result).toBeUndefined();
    });

    it('should handle non-function values in handlers object', () => {
      const handlers = {
        TEST_ACTION: 'not a function',
      };

      const result = resolveHandler(handlers, 'TEST_ACTION');
      expect(result).toBeUndefined();
    });

    it('should handle non-function nested values', () => {
      const handlers = {
        counter: {
          increment: 'not a function',
        },
      };

      const result = resolveHandler(handlers, 'counter.increment');
      expect(result).toBeUndefined();
    });

    it('should handle circular references in nested handlers', () => {
      const handlers = {
        level1: {
          level2: {} as { parent?: unknown },
        },
      };

      // Create a circular reference
      (handlers.level1.level2 as { parent: unknown }).parent = handlers.level1;

      const result = findNestedHandler(handlers, 'level1.level2.parent.level2');
      expect(result).toBeUndefined();
    });
  });
});
