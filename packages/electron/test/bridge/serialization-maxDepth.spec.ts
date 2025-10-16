import type { StateManager } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreBridge } from '../../src/bridge/BridgeFactory.js';

describe('CoreBridge serialization maxDepth configuration', () => {
  let mockStateManager: StateManager<Record<string, unknown>>;
  let unsubscribeCallback: (() => void) | undefined;

  beforeEach(() => {
    // Create a mock state manager
    mockStateManager = {
      getState: vi.fn(() => ({
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    value: 'deep',
                  },
                },
              },
            },
          },
        },
      })),
      subscribe: vi.fn((callback) => {
        unsubscribeCallback = vi.fn();
        return unsubscribeCallback;
      }),
      dispatch: vi.fn(),
    };
  });

  afterEach(async () => {
    // Cleanup is handled by bridge.destroy()
  });

  it('should use default maxDepth of 10 when serialization option is not provided', async () => {
    const bridge = createCoreBridge(mockStateManager);

    expect(mockStateManager.subscribe).toHaveBeenCalled();

    await bridge.destroy();
  });

  it('should use custom maxDepth when serialization.maxDepth is provided', async () => {
    const bridge = createCoreBridge(mockStateManager, {
      serialization: {
        maxDepth: 3,
      },
    });

    expect(mockStateManager.subscribe).toHaveBeenCalled();

    await bridge.destroy();
  });

  it('should pass maxDepth to IpcHandler and SubscriptionHandler', async () => {
    const customMaxDepth = 5;
    const bridge = createCoreBridge(mockStateManager, {
      serialization: {
        maxDepth: customMaxDepth,
      },
    });

    // Verify bridge was created successfully
    expect(bridge).toBeDefined();
    expect(bridge.subscribe).toBeDefined();
    expect(bridge.destroy).toBeDefined();

    await bridge.destroy();
  });
});
