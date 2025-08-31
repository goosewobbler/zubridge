import { describe, expect, it } from 'vitest';
import { sanitizeState } from '../src/utils/serialization.js';

describe('serialization.ts', () => {
  describe('sanitizeState', () => {
    it('should handle primitive values', () => {
      expect(sanitizeState(null as unknown as Record<string, unknown>)).toBeNull();
      expect(sanitizeState(undefined as unknown as Record<string, unknown>)).toBeUndefined();
      expect(sanitizeState(42 as unknown as Record<string, unknown>)).toBe(42);
      expect(sanitizeState('hello' as unknown as Record<string, unknown>)).toBe('hello');
      expect(sanitizeState(true as unknown as Record<string, unknown>)).toBe(true);
    });

    it('should remove functions from objects', () => {
      const input = {
        name: 'test',
        age: 30,
        callback: () => console.log('hello'),
      };

      const output = sanitizeState(input);

      expect(output).toEqual({
        name: 'test',
        age: 30,
      });
      expect(output).not.toHaveProperty('callback');
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          sayHello: () => 'Hello',
          details: {
            age: 30,
            getAge: () => 30,
          },
        },
        items: [1, 2, 3],
      };

      const output = sanitizeState(input);

      expect(output).toEqual({
        user: {
          name: 'John',
          details: {
            age: 30,
          },
        },
        items: [1, 2, 3],
      });

      expect(output.user).not.toHaveProperty('sayHello');
      expect((output.user as Record<string, unknown>).details).not.toHaveProperty('getAge');
    });

    it('should preserve arrays with functions', () => {
      const input = {
        items: [1, 2, 3, () => {}],
        callbacks: [() => {}, () => {}],
      };

      const output = sanitizeState(input);

      // Verify array properties exist
      expect(output).toHaveProperty('items');
      expect(output).toHaveProperty('callbacks');

      // Verify arrays are maintained
      expect(Array.isArray(output.items)).toBe(true);
      expect(Array.isArray(output.callbacks)).toBe(true);

      // Verify primitive values in arrays
      expect(output.items).toContain(1);
      expect(output.items).toContain(2);
      expect(output.items).toContain(3);

      // Verify array lengths
      expect(output.items).toHaveLength(4);
      expect(output.callbacks).toHaveLength(2);
    });

    it('should correctly handle complex object structures', () => {
      const input = {
        data: {
          users: [
            { id: 1, name: 'Alice', getInfo: () => {} },
            { id: 2, name: 'Bob', getInfo: () => {} },
          ],
          settings: {
            theme: 'dark',
            toggleTheme: () => {},
          },
        },
        helpers: {
          format: () => {},
          validate: () => {},
        },
      };

      const output = sanitizeState(input);

      // Test user structure
      expect(output).toHaveProperty('data');
      expect(output.data).toHaveProperty('users');
      expect(output.data).toHaveProperty('settings');

      // Verify settings
      expect((output.data as Record<string, unknown>).settings).toHaveProperty('theme', 'dark');
      expect((output.data as Record<string, unknown>).settings).not.toHaveProperty('toggleTheme');

      // Verify users array
      const users = (output.data as Record<string, unknown>).users;
      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(2);

      // Check user properties
      expect(users[0]).toHaveProperty('id', 1);
      expect(users[0]).toHaveProperty('name', 'Alice');
      expect(users[1]).toHaveProperty('id', 2);
      expect(users[1]).toHaveProperty('name', 'Bob');

      // Check if helpers exists (it should, but be empty)
      expect(output).toHaveProperty('helpers');
      expect(Object.keys(output.helpers as object)).toHaveLength(0);
    });
  });
});
