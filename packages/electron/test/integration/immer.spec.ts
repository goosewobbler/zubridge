import { enableMapSet, produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { sanitizeState } from '../../src/utils/serialization.js';

// Enable Immer plugins for Maps and Sets
enableMapSet();

describe('Immer Integration', () => {
  describe('Serialization with Immer-produced state', () => {
    it('should serialize frozen objects from produce()', () => {
      const baseState = { counter: 0, nested: { value: 'test' } };

      const nextState = produce(baseState, (draft) => {
        draft.counter = 1;
        // nested is unchanged, structurally shared
      });

      // Verify it's frozen in production mode
      expect(Object.isFrozen(nextState)).toBe(true);

      // Verify serialization works without errors
      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        counter: 1,
        nested: { value: 'test' },
      });

      // Verify no errors thrown
      expect(() => sanitizeState(nextState)).not.toThrow();
    });

    it('should handle nested frozen objects', () => {
      const baseState = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      const nextState = produce(baseState, (draft) => {
        draft.level1.level2.level3.value = 'updated';
      });

      // All levels should be frozen
      expect(Object.isFrozen(nextState)).toBe(true);
      expect(Object.isFrozen(nextState.level1)).toBe(true);
      expect(Object.isFrozen(nextState.level1.level2)).toBe(true);

      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        level1: {
          level2: {
            level3: {
              value: 'updated',
            },
          },
        },
      });
    });

    it('should preserve structural sharing semantics after serialization', () => {
      const baseState = {
        shared: { id: 1, name: 'shared' },
        counter: 0,
      };

      const nextState = produce(baseState, (draft) => {
        draft.counter = 1;
        // shared is unchanged, should be structurally shared
      });

      // In the produced state, unchanged parts have same reference
      expect(nextState.shared).toBe(baseState.shared);

      const serialized = sanitizeState(nextState);

      // After serialization, values should match
      expect(serialized.shared).toEqual({ id: 1, name: 'shared' });
      expect(serialized.counter).toBe(1);
    });

    it('should handle arrays within immer state', () => {
      const baseState = {
        items: [1, 2, 3],
        metadata: { count: 3 },
      };

      const nextState = produce(baseState, (draft) => {
        draft.items.push(4);
        draft.metadata.count = draft.items.length;
      });

      expect(Object.isFrozen(nextState)).toBe(true);
      expect(Object.isFrozen(nextState.items)).toBe(true);

      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        items: [1, 2, 3, 4],
        metadata: { count: 4 },
      });
    });

    it('should handle Maps and Sets produced by Immer', () => {
      const baseState = {
        myMap: new Map([['key1', 'value1']]),
        mySet: new Set([1, 2, 3]),
      };

      const nextState = produce(baseState, (draft) => {
        draft.myMap.set('key2', 'value2');
        draft.mySet.add(4);
      });

      const serialized = sanitizeState(nextState);

      // Maps and Sets are serialized to special format by sanitizeState
      expect(serialized.myMap).toEqual({
        __type: 'Map',
        entries: [
          ['key1', 'value1'],
          ['key2', 'value2'],
        ],
      });

      expect(serialized.mySet).toEqual({
        __type: 'Set',
        values: [1, 2, 3, 4],
      });
    });
  });

  describe('IPC round-trip with Immer', () => {
    it('should successfully send immer state through sanitizeState()', () => {
      interface State extends Record<string, unknown> {
        counter: number;
        theme: 'light' | 'dark';
        user: {
          name: string;
          settings: {
            notifications: boolean;
          };
        };
      }

      const baseState: State = {
        counter: 0,
        theme: 'dark',
        user: {
          name: 'Test User',
          settings: {
            notifications: true,
          },
        },
      };

      // Simulate a typical Zustand update with Immer
      const nextState = produce(baseState, (draft) => {
        draft.counter += 1;
        draft.user.settings.notifications = false;
      });

      // This is what Zubridge does before sending over IPC
      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        counter: 1,
        theme: 'dark',
        user: {
          name: 'Test User',
          settings: {
            notifications: false,
          },
        },
      });
    });

    it('should handle complex nested updates', () => {
      const baseState = {
        todos: [
          { id: 1, text: 'First', completed: false },
          { id: 2, text: 'Second', completed: false },
        ],
        filter: 'all',
      };

      const nextState = produce(baseState, (draft) => {
        draft.todos[0].completed = true;
        draft.todos.push({ id: 3, text: 'Third', completed: false });
        draft.filter = 'active';
      });

      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        todos: [
          { id: 1, text: 'First', completed: true },
          { id: 2, text: 'Second', completed: false },
          { id: 3, text: 'Third', completed: false },
        ],
        filter: 'active',
      });
    });

    it('should not leak draft proxies', () => {
      const baseState = { value: 'initial' };
      let capturedDraft: any = null;

      // Try to capture the draft
      produce(baseState, (draft) => {
        capturedDraft = draft;
        draft.value = 'updated';
      });

      // The draft should be revoked after produce completes
      if (capturedDraft) {
        // Verify that sanitizeState handles revoked proxies gracefully
        // It should not throw even when attempting to serialize a revoked draft
        expect(() => sanitizeState(capturedDraft)).not.toThrow();

        // Verify the result is defined and handled properly
        const result = sanitizeState(capturedDraft);
        expect(result).toBeDefined();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle immer state with functions in handlers', () => {
      // This simulates the basic mode pattern where action handlers are in state
      const baseState = {
        counter: 0,
        increment: () => {},
        decrement: () => {},
      };

      const nextState = produce(baseState, (draft) => {
        draft.counter = 5;
        // Functions can't be modified in draft, but that's ok
      });

      const serialized = sanitizeState(nextState);

      // Functions should be removed by sanitizeState
      expect(serialized).toEqual({
        counter: 5,
        // increment and decrement are removed (functions)
      });

      expect(serialized.increment).toBeUndefined();
      expect(serialized.decrement).toBeUndefined();
    });

    it('should handle Date objects within immer state', () => {
      const testDate = new Date('2024-01-01T00:00:00.000Z');
      const baseState = {
        createdAt: testDate,
        counter: 0,
      };

      const nextState = produce(baseState, (draft) => {
        draft.counter = 1;
        // Date is unchanged and structurally shared
      });

      const serialized = sanitizeState(nextState);

      // Dates are converted to ISO strings by sanitizeState
      expect(serialized).toEqual({
        createdAt: '2024-01-01T00:00:00.000Z',
        counter: 1,
      });
      expect(typeof serialized.createdAt).toBe('string');
    });

    it('should handle undefined values', () => {
      const baseState: {
        value1: string | undefined;
        value2: undefined;
        value3: string;
      } = {
        value1: 'present',
        value2: undefined,
        value3: 'also present',
      };

      const nextState = produce(baseState, (draft) => {
        draft.value1 = undefined;
        draft.value3 = 'updated';
      });

      const serialized = sanitizeState(nextState);

      // undefined values are typically removed during serialization
      // or preserved depending on the serialization strategy
      expect(serialized.value3).toBe('updated');
      // value1 and value2 behavior depends on sanitizeState implementation
    });

    it('should handle empty objects and arrays', () => {
      const baseState = {
        emptyObj: {},
        emptyArr: [],
        data: { value: 1 },
      };

      const nextState = produce(baseState, (draft) => {
        draft.data.value = 2;
      });

      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        emptyObj: {},
        emptyArr: [],
        data: { value: 2 },
      });
    });

    it('should handle null values', () => {
      const baseState = {
        nullable: null,
        counter: 0,
      };

      const nextState = produce(baseState, (draft) => {
        draft.counter = 1;
      });

      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        nullable: null,
        counter: 1,
      });
    });

    it('should handle immer with max depth option', () => {
      const baseState = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'deep',
              },
            },
          },
        },
      };

      const nextState = produce(baseState, (draft) => {
        draft.level1.level2.level3.level4.level5 = 'updated';
      });

      // Test with limited depth
      const serialized = sanitizeState(nextState, { maxDepth: 3 });

      // Should truncate at max depth
      type SerializedType = Record<string, unknown>;
      const level1 = (serialized as SerializedType).level1 as SerializedType;
      const level2 = level1?.level2 as SerializedType;
      const level3 = level2?.level3 as SerializedType;
      const level4 = level3?.level4 as string;

      expect(typeof level4).toBe('string');
      expect(level4).toContain('Max Depth Exceeded');
    });

    it('should handle mixed state with immer and non-immer updates', () => {
      // Simulating a scenario where some state is updated with immer and some without
      const baseState = {
        immerUpdated: { value: 0 },
        normalUpdated: { value: 0 },
      };

      // Update with immer
      const withImmer = produce(baseState, (draft) => {
        draft.immerUpdated.value = 1;
      });

      // Then update normally (spread)
      const mixed = {
        ...withImmer,
        normalUpdated: { value: 2 },
      };

      const serialized = sanitizeState(mixed);

      expect(serialized).toEqual({
        immerUpdated: { value: 1 },
        normalUpdated: { value: 2 },
      });
    });
  });

  describe('Zustand + Immer pattern', () => {
    it('should handle the recommended Zustand + Immer pattern', () => {
      // This is the pattern from Zustand docs
      interface State extends Record<string, unknown> {
        count: number;
        nested: {
          value: string;
        };
      }

      const baseState: State = {
        count: 0,
        nested: { value: 'initial' },
      };

      // Simulating: store.setState(produce((draft) => { ... }))
      const nextState = produce(baseState, (draft) => {
        draft.count += 1;
        draft.nested.value = 'updated';
      });

      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        count: 1,
        nested: { value: 'updated' },
      });

      expect(Object.isFrozen(nextState)).toBe(true);
    });

    it('should handle immer with array operations', () => {
      const baseState = {
        items: [{ id: 1 }, { id: 2 }],
      };

      const nextState = produce(baseState, (draft) => {
        // Array mutation methods
        draft.items.push({ id: 3 });
        draft.items.splice(0, 1); // Remove first
        draft.items[0].id = 99; // Modify remaining
      });

      const serialized = sanitizeState(nextState);

      expect(serialized).toEqual({
        items: [{ id: 99 }, { id: 3 }],
      });
    });
  });
});
