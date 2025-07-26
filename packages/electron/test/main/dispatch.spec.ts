import { vi, beforeEach, describe, expect, it } from 'vitest';
import type { AnyState, StateManager } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import type { Store } from 'redux';

// Mock dependencies
vi.mock('../../src/lib/stateManagerRegistry.js', () => ({
  getStateManager: vi.fn(),
}));

// Create a ThunkProcessor mock that doesn't depend on variables defined outside
vi.mock('../../src/main/mainThunkProcessor.js', () => {
  return {
    MainThunkProcessor: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(),
      processAction: vi.fn((action) => action),
    })),
    getMainThunkProcessor: vi.fn().mockReturnValue({
      initialize: vi.fn(),
      processAction: vi.fn((action) => action),
      stateManager: null, // This will be updated in the beforeEach
    }),
  };
});

// Now import the tested modules
import { createDispatch } from '../../src/main/dispatch.js';
import { getStateManager } from '../../src/lib/stateManagerRegistry.js';
import { getMainThunkProcessor } from '../../src/main/mainThunkProcessor.js';

// Helper to create a mock StateManager
function createMockStateManager(): StateManager<AnyState> {
  return {
    getState: vi.fn().mockReturnValue({ count: 0 }),
    processAction: vi.fn().mockImplementation((action) => action),
    subscribe: vi.fn(),
  } as unknown as StateManager<AnyState>;
}

// Helper to create a mock Zustand store
function createMockZustandStore(): StoreApi<AnyState> {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
    getInitialState: vi.fn(() => ({ counter: 0 })),
  } as unknown as StoreApi<AnyState>;
}

// Helper to create a mock Redux store
function createMockReduxStore(): Store<AnyState> {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceReducer: vi.fn(),
    [Symbol.observable]: vi.fn(),
  } as unknown as Store<AnyState>;
}

describe.skip('createDispatch utility', () => {
  let stateManager: StateManager<AnyState>;
  let zustandStore: StoreApi<AnyState>;
  let reduxStore: Store<AnyState>;
  let mockThunkProcessor: any;

  beforeEach(() => {
    // Create mocks for each test
    stateManager = createMockStateManager();
    zustandStore = createMockZustandStore();
    reduxStore = createMockReduxStore();

    // Reset mocks before each test
    vi.resetAllMocks();

    // Set up the mock to return our stateManager instance
    vi.mocked(getStateManager).mockReturnValue(stateManager);

    // Get the mock thunk processor and update its stateManager
    mockThunkProcessor = vi.mocked(getMainThunkProcessor)();
    mockThunkProcessor.stateManager = stateManager;
  });

  describe('createDispatch with StateManager', () => {
    it('should log errors for invalid actions', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dispatch = createDispatch(stateManager);

      await expect(dispatch(null as any)).rejects.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe.skip('createDispatch with Store', () => {
    it('should pass options to getStateManager', async () => {
      const options = { handlers: { CUSTOM: vi.fn() } };

      // Create a mock store that will successfully pass type checks
      const mockStore = {
        getState: vi.fn().mockReturnValue({}),
        setState: vi.fn(),
        subscribe: vi.fn(),
        getInitialState: vi.fn().mockReturnValue({}),
      } as unknown as StoreApi<AnyState>;

      // Safely create the dispatch function
      const dispatch = createDispatch(mockStore, options);

      // Check that getStateManager was called with the expected arguments
      expect(getStateManager).toHaveBeenCalledWith(mockStore, options);
    });
  });
});
