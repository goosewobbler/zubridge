import { describe, expect, it } from 'vitest';
import { DeltaMerger } from '../../src/deltas/DeltaMerger.js';

interface TestState {
  counter: number;
  user: {
    name: string;
    profile: {
      theme: string;
      fontSize?: number;
    };
  };
  items: string[];
  [key: string]: unknown;
}

describe('DeltaMerger', () => {
  const merger = new DeltaMerger<TestState>();

  describe('merge', () => {
    it('should return full state when type is full', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const newState: TestState = {
        counter: 2,
        user: { name: 'Bob', profile: { theme: 'light' } },
        items: ['a'],
      };

      const result = merger.merge(currentState, {
        type: 'full',
        version: 1,
        fullState: newState,
      });

      expect(result).toEqual(newState);
    });

    it('should merge simple property changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { counter: 5 },
      });

      expect(result.counter).toBe(5);
      expect(result.user).toEqual(currentState.user);
    });

    it('should merge deep key path changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { 'user.profile.theme': 'light' },
      });

      expect(result.user.profile.theme).toBe('light');
      expect(result.user.name).toBe('Alice');
    });

    it('should handle multiple key changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { counter: 10, 'user.name': 'Bob' },
      });

      expect(result.counter).toBe(10);
      expect(result.user.name).toBe('Bob');
    });

    it('should handle nested object replacement', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { user: { name: 'Bob', profile: { theme: 'light' } } },
      });

      expect(result.user).toEqual({ name: 'Bob', profile: { theme: 'light' } });
    });

    it('should handle array replacement', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { items: ['a', 'b', 'c'] },
      });

      expect(result.items).toEqual(['a', 'b', 'c']);
    });

    it('should handle empty changed object', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: {},
      });

      expect(result).toEqual(currentState);
    });

    it('should handle fullState being undefined', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'full',
        version: 1,
        fullState: undefined,
      });

      expect(result).toEqual(currentState);
    });

    it('should not wipe state when fullState is empty object', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = merger.merge(currentState, {
        type: 'full',
        version: 1,
        fullState: {} as Partial<TestState>,
      });

      expect(result).toEqual(currentState);
      expect(result.counter).toBe(1);
      expect(result.items).toEqual(['a', 'b']);
    });
  });

  describe('structural sharing', () => {
    it('should preserve immutability for top-level key change', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { counter: 2 },
      });

      expect(result.counter).toBe(2);
      expect(result).not.toBe(currentState);
      expect(result.user).toBe(currentState.user);
      expect(result.items).toBe(currentState.items);
    });

    it('should preserve immutability for nested key change', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { 'user.profile.theme': 'light' },
      });

      expect(result.user.profile.theme).toBe('light');
      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user.profile).not.toBe(currentState.user.profile);
      expect(result.counter).toBe(currentState.counter);
      expect(result.items).toBe(currentState.items);
    });

    it('should preserve sibling properties at intermediate levels', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark', fontSize: 14 } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { 'user.profile.theme': 'light' },
      });

      expect(result.user.profile.theme).toBe('light');
      expect(result.user.profile.fontSize).toBe(14);
      expect(result.user.name).toBe('Alice');
      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user.profile).not.toBe(currentState.user.profile);
    });

    it('should preserve immutability for multiple nested changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { counter: 2, 'user.name': 'Bob' },
      });

      expect(result).not.toBe(currentState);
      expect(result.counter).toBe(2);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user.name).toBe('Bob');
      expect(result.user.profile).toBe(currentState.user.profile);
    });

    it('should not corrupt state when multiple paths share a common ancestor', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { 'user.name': 'Bob', 'user.profile': { theme: 'light' } },
      });

      // Both changes under 'user' must survive
      expect(result.user.name).toBe('Bob');
      expect(result.user.profile).toEqual({ theme: 'light' });
      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
    });

    it('should handle overlapping parent-child paths', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark', fontSize: 14 } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { 'user.name': 'Bob', 'user.profile.theme': 'light' },
      });

      expect(result.user.name).toBe('Bob');
      expect(result.user.profile.theme).toBe('light');
      expect(result.user.profile.fontSize).toBe(14);
    });

    it('should create new reference for entire changed nested object', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { user: { name: 'Bob', profile: { theme: 'light' } } },
      });

      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user.profile).not.toBe(currentState.user.profile);
    });
  });

  describe('removed keys', () => {
    it('should remove a top-level key', () => {
      const currentState = {
        counter: 1,
        temp: 'value',
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        removed: ['temp'],
      });

      expect(result).not.toHaveProperty('temp');
      expect(result.counter).toBe(1);
      expect(result.user).toBe(currentState.user);
    });

    it('should remove a nested key', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark', fontSize: 14 } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        removed: ['user.profile.fontSize'],
      });

      expect(result.user.profile).not.toHaveProperty('fontSize');
      expect(result.user.profile.theme).toBe('dark');
    });

    it('should handle both changed and removed keys', () => {
      const currentState = {
        counter: 1,
        temp: 'value',
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;

      const result = merger.merge(currentState, {
        type: 'delta',
        version: 1,
        changed: { counter: 2 },
        removed: ['temp'],
      });

      expect(result.counter).toBe(2);
      expect(result).not.toHaveProperty('temp');
    });
  });
});
