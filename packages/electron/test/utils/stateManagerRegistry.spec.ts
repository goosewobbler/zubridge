import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyState, StateManager } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import type { Store } from 'redux';

import { getStateManager, removeStateManager, clearStateManagers } from '../../src/utils/stateManagerRegistry.js';
import * as zustandAdapter from '../../src/adapters/zustand.js';
import * as reduxAdapter from '../../src/adapters/redux.js';

// Helper to create a mock Zustand store
function createMockZustandStore() {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  } as unknown as StoreApi<AnyState>;
}

// Helper to create a mock Redux store
function createMockReduxStore() {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceReducer: vi.fn(),
    [Symbol.observable]: vi.fn(),
  } as unknown as Store<AnyState>;
}

describe('StateManagerRegistry', () => {
  let mockZustandAdapter: StateManager<AnyState>;
  let mockReduxAdapter: StateManager<AnyState>;
  let createZustandAdapterSpy: any;
  let createReduxAdapterSpy: any;

  beforeEach(() => {
    vi.resetAllMocks();

    // Create mock adapters
    mockZustandAdapter = {
      getState: vi.fn(),
      subscribe: vi.fn(),
      processAction: vi.fn(),
    };

    mockReduxAdapter = {
      getState: vi.fn(),
      subscribe: vi.fn(),
      processAction: vi.fn(),
    };

    // Mock adapter creation functions
    createZustandAdapterSpy = vi.spyOn(zustandAdapter, 'createZustandAdapter').mockReturnValue(mockZustandAdapter);
    createReduxAdapterSpy = vi.spyOn(reduxAdapter, 'createReduxAdapter').mockReturnValue(mockReduxAdapter);

    // Reset internal WeakMap by calling clearStateManagers
    clearStateManagers();
  });

  describe('getStateManager', () => {
    it('should create a Zustand adapter for Zustand stores', () => {
      const zustandStore = createMockZustandStore();
      const options = { exposeState: true };

      const stateManager = getStateManager(zustandStore, options);

      expect(createZustandAdapterSpy).toHaveBeenCalledWith(zustandStore, options);
      expect(stateManager).toBe(mockZustandAdapter);
    });

    it('should create a Redux adapter for Redux stores', () => {
      const reduxStore = createMockReduxStore();
      const options = { handlers: { TEST: vi.fn() } };

      const stateManager = getStateManager(reduxStore, options);

      expect(createReduxAdapterSpy).toHaveBeenCalledWith(reduxStore, options);
      expect(stateManager).toBe(mockReduxAdapter);
    });

    it('should throw an error for unrecognized store types', () => {
      const invalidStore = { invalid: true };

      expect(() => {
        // @ts-ignore - Testing with invalid store
        getStateManager(invalidStore);
      }).toThrow('Unrecognized store type');
    });

    it('should reuse the same adapter for repeated calls with the same store', () => {
      const zustandStore = createMockZustandStore();

      const adapter1 = getStateManager(zustandStore);
      createZustandAdapterSpy.mockClear(); // Clear the spy

      const adapter2 = getStateManager(zustandStore);

      expect(adapter1).toBe(adapter2);
      expect(createZustandAdapterSpy).not.toHaveBeenCalled(); // Should not create a new adapter
    });
  });

  describe('removeStateManager', () => {
    it('should remove the state manager for a store', () => {
      const zustandStore = createMockZustandStore();

      // First, get a state manager to cache it
      const adapter1 = getStateManager(zustandStore);

      // Remove it
      removeStateManager(zustandStore);

      // Create a new mock adapter for the second call
      const secondAdapter = {
        getState: vi.fn(),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      // Update the spy to return the new adapter
      createZustandAdapterSpy.mockReturnValue(secondAdapter);

      // Get a new one - should create a new adapter
      createZustandAdapterSpy.mockClear();
      const adapter2 = getStateManager(zustandStore);

      expect(createZustandAdapterSpy).toHaveBeenCalled(); // Should create a new adapter
      expect(adapter2).toBe(secondAdapter); // Should be our new mock
      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('clearStateManagers', () => {
    it('should clear all state managers', () => {
      const zustandStore = createMockZustandStore();
      const reduxStore = createMockReduxStore();

      // Get state managers to cache them
      getStateManager(zustandStore);
      getStateManager(reduxStore);

      // Clear all adapters
      clearStateManagers();

      // Reset mocks
      createZustandAdapterSpy.mockClear();
      createReduxAdapterSpy.mockClear();

      // Get new adapters - should create new ones
      getStateManager(zustandStore);
      getStateManager(reduxStore);

      expect(createZustandAdapterSpy).toHaveBeenCalled();
      expect(createReduxAdapterSpy).toHaveBeenCalled();
    });
  });
});
