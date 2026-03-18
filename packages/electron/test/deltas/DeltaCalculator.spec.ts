import { describe, expect, it } from 'vitest';
import { DeltaCalculator } from '../../src/deltas/DeltaCalculator.js';

interface TestState {
  counter: number;
  user: {
    name: string;
    profile: {
      theme: string;
    };
  };
  items: string[];
  [key: string]: unknown;
}

describe('DeltaCalculator', () => {
  const calculator = new DeltaCalculator<TestState>();

  describe('normalizeKeys', () => {
    it('should return "*" for undefined keys', () => {
      expect(calculator.normalizeKeys(undefined)).toBe('*');
    });

    it('should return "*" when keys includes "*"', () => {
      expect(calculator.normalizeKeys(['*'])).toBe('*');
      expect(calculator.normalizeKeys(['counter', '*'])).toBe('*');
    });

    it('should return empty array for empty keys', () => {
      expect(calculator.normalizeKeys([])).toEqual([]);
    });

    it('should deduplicate and sort keys', () => {
      expect(calculator.normalizeKeys(['user', 'counter', 'user'])).toEqual(['counter', 'user']);
    });

    it('should trim and filter empty keys', () => {
      expect(calculator.normalizeKeys([' counter ', '', '  '])).toEqual(['counter']);
    });
  });

  describe('calculate', () => {
    it('should return full state when prev is undefined (initial state)', () => {
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = calculator.calculate(undefined, next, '*');

      expect(result).toEqual({
        type: 'full',
        fullState: next,
      });
    });

    it('should return delta with changed top-level keys for full subscription', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };
      const next: TestState = {
        counter: 2,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = calculator.calculate(prev, next, '*');

      expect(result).toEqual({
        type: 'delta',
        changed: { counter: 2 },
      });
    });

    it('should return top-level key deltas for full subscription with multiple changes', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };
      const next: TestState = {
        counter: 2,
        user: { name: 'Bob', profile: { theme: 'light' } },
        items: ['a', 'b'],
      };

      const result = calculator.calculate(prev, next, '*');

      expect(result).toEqual({
        type: 'delta',
        changed: {
          counter: 2,
          user: { name: 'Bob', profile: { theme: 'light' } },
        },
      });
    });

    it('should return delta with only changed keys', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };
      const next: TestState = {
        counter: 2,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = calculator.calculate(prev, next, ['counter']);

      expect(result).toEqual({
        type: 'delta',
        changed: { counter: 2 },
      });
    });

    it('should detect changes in deep key paths', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'light' } },
        items: [],
      };

      const result = calculator.calculate(prev, next, ['user.profile.theme']);

      expect(result).toEqual({
        type: 'delta',
        changed: { 'user.profile.theme': 'light' },
      });
    });

    it('should return null when nothing changed (selective keys)', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = calculator.calculate(prev, next, ['counter', 'user']);

      expect(result).toBeNull();
    });

    it('should return null when nothing changed (full subscription)', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = calculator.calculate(prev, next, '*');

      expect(result).toBeNull();
    });

    it('should handle multiple key changes', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const next: TestState = {
        counter: 2,
        user: { name: 'Bob', profile: { theme: 'dark' } },
        items: [],
      };

      const result = calculator.calculate(prev, next, ['counter', 'user.name']);

      expect(result).toEqual({
        type: 'delta',
        changed: { counter: 2, 'user.name': 'Bob' },
      });
    });

    it('should handle nested object changes', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'light' } },
        items: [],
      };

      const result = calculator.calculate(prev, next, ['user']);

      expect(result).toEqual({
        type: 'delta',
        changed: {
          user: { name: 'Alice', profile: { theme: 'light' } },
        },
      });
    });

    it('should handle array changes', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b', 'c'],
      };

      const result = calculator.calculate(prev, next, ['items']);

      expect(result).toEqual({
        type: 'delta',
        changed: { items: ['a', 'b', 'c'] },
      });
    });

    it('should work with pre-normalized deduplicated keys', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const next: TestState = {
        counter: 2,
        user: { name: 'Bob', profile: { theme: 'light' } },
        items: [],
      };

      const normalizedKeys = calculator.normalizeKeys(['user', 'counter', 'user']);
      const result = calculator.calculate(prev, next, normalizedKeys as string[]);

      expect(result).toEqual({
        type: 'delta',
        changed: {
          counter: 2,
          user: { name: 'Bob', profile: { theme: 'light' } },
        },
      });
    });

    it('should correctly detect changes from/to falsy values', () => {
      const prev: TestState = {
        counter: 0,
        user: { name: '', profile: { theme: 'dark' } },
        items: [],
      };
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = calculator.calculate(prev, next, ['counter', 'user.name']);

      expect(result).toEqual({
        type: 'delta',
        changed: { counter: 1, 'user.name': 'Alice' },
      });
    });
  });

  describe('removed keys', () => {
    it('should track removed top-level keys in full subscription', () => {
      const prev = {
        counter: 1,
        temp: 'value',
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;
      const next = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;

      const result = calculator.calculate(prev, next, '*');

      expect(result).toEqual({
        type: 'delta',
        removed: ['temp'],
      });
    });

    it('should track removed keys in selective subscription', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const next = {
        counter: 1,
        user: { name: 'Alice', profile: {} },
        items: [],
      } as unknown as TestState;

      const result = calculator.calculate(prev, next, ['user.profile.theme']);

      expect(result).toEqual({
        type: 'delta',
        removed: ['user.profile.theme'],
      });
    });

    it('should promote child-path removal to root when entire parent is absent', () => {
      // Regression: subscribing to ['user.name'] and entire 'user' key is
      // deleted should emit removed: ['user'], not removed: ['user.name'].
      // Without promotion, DeltaMerger would only delete the leaf and leave
      // a stale empty-object shell: cachedState.user = {} instead of undefined.
      const prev = {
        counter: 1,
        user: { name: 'Alice' },
        items: [],
      } as TestState;
      const next = {
        counter: 1,
        items: [],
      } as TestState;

      const result = calculator.calculate(prev, next, ['user.name']);

      expect(result).toEqual({
        type: 'delta',
        removed: ['user'],
      });
    });

    it('should deduplicate promoted root when multiple child paths share the same absent parent', () => {
      const prev = { counter: 1, user: { name: 'Alice', age: 30 }, items: [] } as TestState;
      const next = { counter: 1, items: [] } as TestState;

      const result = calculator.calculate(prev, next, ['user.name', 'user.age']);

      expect(result?.removed).toEqual(['user']);
    });

    it('should not promote child removal when parent still exists in next', () => {
      const prev = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;
      const next = {
        counter: 1,
        user: { profile: { theme: 'dark' } },
        items: [],
      } as TestState;

      const result = calculator.calculate(prev, next, ['user.name']);

      // 'user' still exists in next — no promotion
      expect(result?.removed).toEqual(['user.name']);
    });

    it('should track both changed and removed keys', () => {
      const prev = {
        counter: 1,
        temp: 'value',
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;
      const next = {
        counter: 2,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;

      const result = calculator.calculate(prev, next, '*');

      expect(result).toEqual({
        type: 'delta',
        changed: { counter: 2 },
        removed: ['temp'],
      });
    });
  });

  describe('getPartialState (via calculate with prev=undefined)', () => {
    it('should not mutate source state when parent and child paths overlap', () => {
      const state: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      // Freeze the user object to detect any mutation attempts
      const originalUser = state.user;
      const originalProfile = state.user.profile;

      // calculate with prev=undefined triggers getPartialState internally
      // Using both 'user' (parent) and 'user.name' (child) would previously
      // mutate state.user via a live reference stored by setDeep
      const normalizedKeys = calculator.normalizeKeys(['user', 'user.name']);
      calculator.calculate(undefined, state, normalizedKeys as string[]);

      // Source state must not be mutated
      expect(state.user).toBe(originalUser);
      expect(state.user.profile).toBe(originalProfile);
      expect(state.user.name).toBe('Alice');
      expect(state.user.profile.theme).toBe('dark');
    });
  });
});
