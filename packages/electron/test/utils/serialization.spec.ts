import type { AnyState } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPromise, sanitizeState } from '../../src/utils/serialization.js';

// Mock the debug function
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

describe('Serialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPromise', () => {
    it('should return true for Promise objects', () => {
      const promise = Promise.resolve('test');
      expect(isPromise(promise)).toBe(true);
    });

    it('should return false for non-Promise objects', () => {
      expect(isPromise('string')).toBe(false);
      expect(isPromise(42)).toBe(false);
      expect(isPromise({})).toBe(false);
      expect(isPromise(null)).toBe(false);
      expect(isPromise(undefined)).toBe(false);
    });

    it('should return true for objects with then method', () => {
      // biome-ignore lint/suspicious/noThenProperty: Test needs to access private property
      const fakePromise = { then: () => {} };
      expect(isPromise(fakePromise)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isPromise(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPromise(undefined)).toBe(false);
    });
  });

  describe('sanitizeState', () => {
    it('should return primitives unchanged', () => {
      expect(sanitizeState('string' as unknown as AnyState)).toBe('string');
      expect(sanitizeState(42 as unknown as AnyState)).toBe(42);
      expect(sanitizeState(true as unknown as AnyState)).toBe(true);
      expect(sanitizeState(null as unknown as AnyState)).toBe(null);
      expect(sanitizeState(undefined as unknown as AnyState)).toBe(undefined);
    });

    it('should handle bigint values', () => {
      const result = sanitizeState({ value: 123n });
      expect(result).toEqual({ value: '123n' });
    });

    it('should handle symbol values', () => {
      const symbol = Symbol('test');
      const result = sanitizeState({ value: symbol });
      expect(result).toEqual({ value: '[Symbol: Symbol(test)]' });
    });

    it('should remove functions', () => {
      const state = {
        name: 'test',
        func: () => 'removed',
        nested: {
          func2: () => 'also removed',
        },
      };
      const result = sanitizeState(state);
      expect(result).toEqual({
        name: 'test',
        nested: {},
      });
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const result = sanitizeState({ timestamp: date });
      expect(result).toEqual({ timestamp: '2023-01-01T00:00:00.000Z' });
    });

    it('should handle RegExp objects', () => {
      const regex = /test/gi;
      const result = sanitizeState({ pattern: regex });
      expect(result).toEqual({ pattern: '[RegExp: /test/gi]' });
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      const result = sanitizeState({ error });
      expect(result).toEqual({
        error: {
          name: 'Error',
          message: 'Test error',
          stack: expect.any(String),
        },
      });
    });

    it('should handle Map objects', () => {
      const map = new Map<string, string | number>([
        ['key1', 'value1'],
        ['key2', 42],
      ]);
      const result = sanitizeState({ data: map });
      expect(result).toEqual({
        data: {
          __type: 'Map',
          entries: [
            ['key1', 'value1'],
            ['key2', 42],
          ],
        },
      });
    });

    it('should handle Set objects', () => {
      const set = new Set(['value1', 42, true]);
      const result = sanitizeState({ data: set });
      expect(result).toEqual({
        data: {
          __type: 'Set',
          values: ['value1', 42, true],
        },
      });
    });

    it('should handle arrays', () => {
      const array = [1, 'string', { nested: 'value' }];
      const result = sanitizeState({ data: array });
      expect(result).toEqual({
        data: [1, 'string', { nested: 'value' }],
      });
    });

    it('should handle nested objects', () => {
      const state = {
        user: {
          id: 123,
          profile: {
            name: 'John',
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        metadata: {
          version: '1.0.0',
        },
      };
      const result = sanitizeState(state);
      expect(result).toEqual(state);
    });

    it('should handle circular references', () => {
      const obj = { name: 'test' } as { name: string; self?: unknown };
      obj.self = obj;
      const result = sanitizeState({ data: obj });
      expect(result).toEqual({
        data: {
          name: 'test',
          self: '[Circular Reference]',
        },
      });
    });

    it('should respect maxDepth option', () => {
      const deep = { level1: { level2: { level3: { level4: 'deep' } } } };
      const result = sanitizeState(deep, { maxDepth: 2 });
      expect(result).toEqual({
        level1: {
          level2: {
            level3: '[Max Depth Exceeded: level1.level2.level3]',
          },
        },
      });
    });

    it('should filter keys when filterKeys is provided', () => {
      const state = { a: 1, b: 2, c: 3, d: 4 };
      const result = sanitizeState(state, { filterKeys: ['a', 'c'] });
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('should handle replacer function', () => {
      const state = { password: 'secret', name: 'John' };
      const result = sanitizeState(state, {
        replacer: (key, value) => (key === 'password' ? '[REDACTED]' : value),
      });
      expect(result).toEqual({
        password: '[REDACTED]',
        name: 'John',
      });
    });

    it('should handle property access errors gracefully', () => {
      const problematic = {};
      Object.defineProperty(problematic, 'badProp', {
        get() {
          throw new Error('Access denied');
        },
        enumerable: true,
      });

      const result = sanitizeState({ data: problematic });
      expect(result).toEqual({
        data: {
          badProp: '[Error accessing property: Access denied]',
        },
      });
    });

    it('should handle TypedArrays', () => {
      const buffer = new Uint8Array([1, 2, 3, 4]);
      const result = sanitizeState({ data: buffer });
      expect(result).toEqual({
        data: '[Uint8Array: 4 bytes]',
      });
    });

    it('should handle ArrayBuffer', () => {
      const buffer = new ArrayBuffer(16);
      const result = sanitizeState({ data: buffer });
      expect(result).toEqual({
        data: '[ArrayBuffer: 16 bytes]',
      });
    });

    it('should handle non-enumerable properties when requested', () => {
      const obj = { visible: 'seen' };
      Object.defineProperty(obj, 'hidden', {
        value: 'not seen',
        enumerable: false,
      });

      const result = sanitizeState({ data: obj }, { includeNonEnumerable: true });
      expect(result).toEqual({
        data: {
          visible: 'seen',
          hidden: 'not seen',
        },
      });
    });

    it('should handle serialization errors gracefully', () => {
      const problematic = {};
      Object.defineProperty(problematic, 'badProp', {
        get() {
          throw 'Non-Error throw';
        },
        enumerable: true,
      });

      const result = sanitizeState({ data: problematic });
      expect(result).toEqual({
        data: {
          badProp: '[Error accessing property: Non-Error throw]',
        },
      });
    });

    it('should handle critical serialization errors gracefully', () => {
      // Create an object that causes serialization to fail completely
      const badObject = {};
      Object.defineProperty(badObject, 'toString', {
        get() {
          throw new Error('Critical failure');
        },
      });

      // Should not throw and should return some result
      expect(() => sanitizeState(badObject)).not.toThrow();
      const result = sanitizeState(badObject);
      expect(result).toBeDefined();
    });

    it('should handle non-object state', () => {
      expect(sanitizeState('string' as unknown as AnyState)).toBe('string');
      expect(sanitizeState(42 as unknown as AnyState)).toBe(42);
      expect(sanitizeState(null as unknown as AnyState)).toBe(null);
      expect(sanitizeState(undefined as unknown as AnyState)).toBe(undefined);
    });

    it('should handle special number values', () => {
      const result = sanitizeState({ data: Number.NaN });
      expect(result).toEqual({ data: Number.NaN });
    });
  });
});
