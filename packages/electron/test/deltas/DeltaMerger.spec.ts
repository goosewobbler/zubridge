import { describe, expect, it } from 'vitest';

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

function mergeDelta<S>(
  currentState: S,
  delta: {
    type: 'delta' | 'full';
    version: number;
    changed?: Record<string, unknown>;
    fullState?: Partial<S>;
  },
): S {
  if (delta.type === 'full' || !delta.changed) {
    return (delta.fullState ?? currentState) as S;
  }

  const merged = { ...currentState } as Record<string, unknown>;

  for (const [keyPath, value] of Object.entries(delta.changed)) {
    setDeep(merged, keyPath, value);
  }

  return merged as S;
}

function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let curr = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!curr[keys[i]]) curr[keys[i]] = {};
    curr = curr[keys[i]] as Record<string, unknown>;
  }
  curr[keys[keys.length - 1]] = value;
}

describe('DeltaMerger (inline)', () => {
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

      const result = mergeDelta(currentState, {
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

      const result = mergeDelta(currentState, {
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

      const result = mergeDelta(currentState, {
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

      const result = mergeDelta(currentState, {
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

      const result = mergeDelta(currentState, {
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

      const result = mergeDelta(currentState, {
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

      const result = mergeDelta(currentState, {
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

      const result = mergeDelta(currentState, {
        type: 'full',
        version: 1,
        fullState: undefined,
      });

      expect(result).toEqual(currentState);
    });
  });
});
