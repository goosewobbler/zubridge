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
  });
});
