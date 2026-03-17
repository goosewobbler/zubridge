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
        changed: { counter: 5 },
      });

      expect(result.counter).toBe(5);
      expect(result.user).toEqual(currentState.user);
    });

    it('should apply child dot-path correctly when delta.changed has parent before child (insertion order)', () => {
      // Regression: if entries are NOT sorted, child ('user.name') processed first
      // gets overwritten by parent ('user') structuredClone, silently losing the child update.
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      // Deliberately pass parent key before child key (natural insertion order that DeltaCalculator produces)
      const result = merger.merge(currentState, {
        type: 'delta',
        changed: {
          user: { name: 'Alice', profile: { theme: 'dark' } } as TestState['user'],
          'user.name': 'Bob',
        },
      });

      expect((result.user as TestState['user']).name).toBe('Bob');
    });

    it('should merge deep key path changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'user.profile.theme': 'light' },
      });

      expect(result.user?.profile.theme).toBe('light');
      expect(result.user?.name).toBe('Alice');
    });

    it('should handle multiple key changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { counter: 10, 'user.name': 'Bob' },
      });

      expect(result.counter).toBe(10);
      expect(result.user?.name).toBe('Bob');
    });

    it('should handle nested object replacement', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
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
        fullState: undefined,
      });

      expect(result).toEqual(currentState);
    });

    it('should return a defensive clone of fullState, not the same reference', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };
      const fullState: TestState = {
        counter: 2,
        user: { name: 'Bob', profile: { theme: 'light' } },
        items: ['a'],
      };

      const result = merger.merge(currentState, {
        type: 'full',
        fullState,
      });

      expect(result).toEqual(fullState);
      // Must be a different reference — mutating result must not affect fullState
      expect(result).not.toBe(fullState);
      (result as TestState).counter = 999;
      expect(fullState.counter).toBe(2);
    });

    it('should not wipe state when fullState is empty object', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: ['a', 'b'],
      };

      const result = merger.merge(currentState, {
        type: 'full',
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
        changed: { 'user.profile.theme': 'light' },
      });

      expect(result.user?.profile.theme).toBe('light');
      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user?.profile).not.toBe(currentState.user.profile);
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
        changed: { 'user.profile.theme': 'light' },
      });

      expect(result.user?.profile.theme).toBe('light');
      expect(result.user?.profile.fontSize).toBe(14);
      expect(result.user?.name).toBe('Alice');
      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user?.profile).not.toBe(currentState.user.profile);
    });

    it('should preserve immutability for multiple nested changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { counter: 2, 'user.name': 'Bob' },
      });

      expect(result).not.toBe(currentState);
      expect(result.counter).toBe(2);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user?.name).toBe('Bob');
      expect(result.user?.profile).toBe(currentState.user.profile);
    });

    it('should not corrupt state when multiple paths share a common ancestor', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'user.name': 'Bob', 'user.profile': { theme: 'light' } },
      });

      // Both changes under 'user' must survive
      expect(result.user?.name).toBe('Bob');
      expect(result.user?.profile).toEqual({ theme: 'light' });
      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
    });

    it('should preserve both writes when sibling dot-paths share a leaf parent in reverse order', () => {
      const originalProfile = { theme: 'dark', fontSize: 14 };
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: originalProfile },
        items: [],
      };

      // Keys deliberately in reverse-sorted order so the second call to
      // setDeepWithStructuralSharing must hit the "already cloned — reuse"
      // branch for user.profile rather than cloning a second time (which
      // would discard the theme write).
      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'user.profile.theme': 'light', 'user.profile.fontSize': 18 },
      });

      // Both sibling writes must survive
      expect(result.user?.profile.theme).toBe('light');
      expect(result.user?.profile.fontSize).toBe(18);
      // The profile clone is shared — only one clone, not two
      expect(result.user?.profile).not.toBe(originalProfile);
      // Original must be untouched
      expect(originalProfile.theme).toBe('dark');
      expect(originalProfile.fontSize).toBe(14);
      // Unrelated branches structurally shared
      expect(result.items).toBe(currentState.items);
    });

    it('should handle overlapping parent-child paths', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark', fontSize: 14 } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'user.name': 'Bob', 'user.profile.theme': 'light' },
      });

      expect(result.user?.name).toBe('Bob');
      expect(result.user?.profile.theme).toBe('light');
      expect(result.user?.profile.fontSize).toBe(14);
    });

    it('should create new reference for entire changed nested object', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { user: { name: 'Bob', profile: { theme: 'light' } } },
      });

      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user?.profile).not.toBe(currentState.user.profile);
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
        removed: ['user.profile.fontSize'],
      });

      expect(result.user?.profile).not.toHaveProperty('fontSize');
      expect(result.user?.profile.theme).toBe('dark');
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
        changed: { counter: 2 },
        removed: ['temp'],
      });

      expect(result.counter).toBe(2);
      expect(result).not.toHaveProperty('temp');
    });

    it('should handle changed and removed paths sharing a common ancestor', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark', fontSize: 14 } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'user.name': 'Bob' },
        removed: ['user.profile.fontSize'],
      });

      expect(result.user?.name).toBe('Bob');
      expect(result.user?.profile.theme).toBe('dark');
      expect(result.user?.profile).not.toHaveProperty('fontSize');
      expect(result).not.toBe(currentState);
      expect(result.user).not.toBe(currentState.user);
      expect(result.user?.profile).not.toBe(currentState.user.profile);
    });

    it('should preserve NaN values in delta changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { counter: Number.NaN },
      });

      expect(result.counter).toBeNaN();
    });

    it('should preserve Infinity and -Infinity values in delta changes', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: {
          maxValue: Number.POSITIVE_INFINITY,
          minValue: Number.NEGATIVE_INFINITY,
        },
      });

      expect(result.maxValue).toBe(Number.POSITIVE_INFINITY);
      expect(result.minValue).toBe(Number.NEGATIVE_INFINITY);
    });

    it('should preserve NaN inside an object value (cloneValue path)', () => {
      // Exercises cloneValue with an object containing NaN — the JSON fallback
      // would corrupt this to null, but structuredClone handles it correctly.
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { user: { name: 'Alice', score: Number.NaN } as unknown as TestState['user'] },
      });

      expect((result.user as unknown as { score: number }).score).toBeNaN();
    });

    it('should preserve NaN/Infinity in nested delta paths', () => {
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'user.profile.fontSize': Number.NaN },
      });

      expect(result.user?.profile.fontSize).toBeNaN();
    });

    it('should not double-clone when deleteDeep traverses a path already cloned by setDeep', () => {
      const originalProfile = { theme: 'dark', fontSize: 14 };
      const currentState: TestState = {
        counter: 1,
        user: { name: 'Alice', profile: originalProfile },
        items: [],
      };

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'user.profile.theme': 'light' },
        removed: ['user.profile.fontSize'],
      });

      // Both changed and removed operate under user.profile.
      // deleteDeep must reuse the clone created by setDeepWithStructuralSharing,
      // not create a second one that discards the theme change.
      expect(result.user?.profile.theme).toBe('light');
      expect(result.user?.profile).not.toHaveProperty('fontSize');
      // The profile in result must be a single clone, different from original
      expect(result.user?.profile).not.toBe(originalProfile);
      // Unchanged siblings should be preserved
      expect(result.items).toBe(currentState.items);
    });

    it('should preserve array type when dot-path traverses an array intermediate node (set)', () => {
      const currentState = {
        counter: 1,
        items: [{ done: false }, { done: false }],
        user: { name: 'Alice' },
      } as unknown as TestState;

      const result = merger.merge(currentState, {
        type: 'delta',
        changed: { 'items.0.done': true },
      });

      // items must remain an Array, not a plain object
      expect(Array.isArray((result as unknown as { items: unknown }).items)).toBe(true);
      expect((result as unknown as { items: Array<{ done: boolean }> }).items[0].done).toBe(true);
      expect((result as unknown as { items: Array<{ done: boolean }> }).items[1].done).toBe(false);
    });

    it('should preserve array type when dot-path traverses an array intermediate node (delete)', () => {
      const currentState = {
        counter: 1,
        items: [{ done: true, label: 'first' }, { done: false }],
        user: { name: 'Alice' },
      } as unknown as TestState;

      const result = merger.merge(currentState, {
        type: 'delta',
        removed: ['items.0.label'],
      });

      // items must remain an Array, not a plain object
      expect(Array.isArray((result as unknown as { items: unknown }).items)).toBe(true);
      const items = (result as unknown as { items: Array<{ done: boolean; label?: string }> })
        .items;
      expect(items[0]).not.toHaveProperty('label');
      expect(items[0].done).toBe(true);
    });

    it('should delete through a path where an intermediate value is falsy but non-null', () => {
      // Regression: !next would short-circuit on 0/false/"", silently aborting deletion
      const currentState = {
        counter: 1,
        flags: { enabled: false, label: 'test' },
        user: { name: 'Alice', profile: { theme: 'dark' } },
        items: [],
      } as TestState;

      const result = merger.merge(currentState, {
        type: 'delta',
        removed: ['flags.label'],
      });

      expect(result.flags).not.toHaveProperty('label');
      expect((result.flags as Record<string, unknown>).enabled).toBe(false);
    });
  });
});
