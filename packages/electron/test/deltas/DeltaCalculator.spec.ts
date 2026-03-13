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
}

describe('DeltaCalculator', () => {
  const calculator = new DeltaCalculator<TestState>();

  describe('calculate', () => {
    it('should return full state when prev is undefined (initial state)', () => {
      const next: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = calculator.calculate(undefined, next);

      expect(result.type).toBe('full');
      expect(result.fullState).toEqual(next);
    });

    it('should return full state when keys is undefined (full subscription)', () => {
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

      const result = calculator.calculate(prev, next, undefined);

      expect(result.type).toBe('full');
    });

    it('should return full state when keys includes "*"', () => {
      const prev: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const next: TestState = {
        counter: 2,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = calculator.calculate(prev, next, ['*']);

      expect(result.type).toBe('full');
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

      expect(result.type).toBe('delta');
      expect(result.changed).toEqual({ counter: 2 });
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

      expect(result.type).toBe('delta');
      expect(result.changed).toEqual({ 'user.profile.theme': 'light' });
    });

    it('should return empty delta when nothing changed', () => {
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

      expect(result.type).toBe('full');
      expect(result.fullState).toEqual({});
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

      expect(result.type).toBe('delta');
      expect(result.changed).toEqual({ counter: 2, 'user.name': 'Bob' });
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

      expect(result.type).toBe('delta');
      expect(result.changed).toEqual({
        user: { name: 'Alice', profile: { theme: 'light' } },
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

      expect(result.type).toBe('delta');
      expect(result.changed).toEqual({ items: ['a', 'b', 'c'] });
    });

    it('should deduplicate and sort keys', () => {
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

      const result = calculator.calculate(prev, next, ['user', 'counter', 'user']);

      expect(result.type).toBe('delta');
      expect(result.changed).toEqual({
        counter: 2,
        user: { name: 'Bob', profile: { theme: 'light' } },
      });
    });
  });
});
