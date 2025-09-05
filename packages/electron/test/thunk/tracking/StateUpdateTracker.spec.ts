import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StateUpdateTracker } from '../../../src/thunk/tracking/StateUpdateTracker.js';

describe('StateUpdateTracker', () => {
  let tracker: StateUpdateTracker;

  beforeEach(() => {
    tracker = new StateUpdateTracker();
    vi.clearAllMocks();
  });

  describe('trackStateUpdateForThunk', () => {
    it('should track a state update for a thunk', () => {
      const thunkId = 'thunk-1';
      const updateId = 'update-1';
      const renderers = [1, 2, 3];

      expect(() => tracker.trackStateUpdateForThunk(thunkId, updateId, renderers)).not.toThrow();
      expect(tracker.hasPendingStateUpdates(thunkId)).toBe(true);
      expect(tracker.getPendingUpdateCount()).toBe(1);
    });

    it('should track multiple state updates for same thunk', () => {
      const thunkId = 'thunk-1';

      tracker.trackStateUpdateForThunk(thunkId, 'update-1', [1, 2]);
      tracker.trackStateUpdateForThunk(thunkId, 'update-2', [3, 4]);

      expect(tracker.hasPendingStateUpdates(thunkId)).toBe(true);
      expect(tracker.getPendingUpdateCount()).toBe(2);
    });

    it('should track state updates for different thunks', () => {
      tracker.trackStateUpdateForThunk('thunk-1', 'update-1', [1]);
      tracker.trackStateUpdateForThunk('thunk-2', 'update-2', [2]);

      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(true);
      expect(tracker.hasPendingStateUpdates('thunk-2')).toBe(true);
      expect(tracker.getPendingUpdateCount()).toBe(2);
    });
  });

  describe('acknowledgeStateUpdate', () => {
    it('should acknowledge state update from renderer', () => {
      const updateId = 'update-1';
      const renderers = [1, 2];

      tracker.trackStateUpdateForThunk('thunk-1', updateId, renderers);

      // First acknowledgment - not all renderers have acknowledged
      expect(tracker.acknowledgeStateUpdate(updateId, 1)).toBe(false);
      expect(tracker.getPendingUpdateCount()).toBe(1);

      // Second acknowledgment - all renderers have acknowledged
      expect(tracker.acknowledgeStateUpdate(updateId, 2)).toBe(true);
      expect(tracker.getPendingUpdateCount()).toBe(0);
    });

    it('should return true for unknown update ID', () => {
      expect(tracker.acknowledgeStateUpdate('unknown-update', 1)).toBe(true);
    });

    it('should ignore acknowledgments from non-subscribed renderers', () => {
      const updateId = 'update-1';
      const renderers = [1, 2];

      tracker.trackStateUpdateForThunk('thunk-1', updateId, renderers);

      // Renderer 3 was not subscribed, should return false
      expect(tracker.acknowledgeStateUpdate(updateId, 3)).toBe(false);
      expect(tracker.getPendingUpdateCount()).toBe(1);

      // Proper acknowledgment should still work
      expect(tracker.acknowledgeStateUpdate(updateId, 1)).toBe(false);
      expect(tracker.acknowledgeStateUpdate(updateId, 2)).toBe(true);
    });

    it('should handle multiple acknowledgments from same renderer gracefully', () => {
      const updateId = 'update-1';
      const renderers = [1, 2];

      tracker.trackStateUpdateForThunk('thunk-1', updateId, renderers);

      // Acknowledge from renderer 1 multiple times
      expect(tracker.acknowledgeStateUpdate(updateId, 1)).toBe(false);
      expect(tracker.acknowledgeStateUpdate(updateId, 1)).toBe(false);

      // Still need acknowledgment from renderer 2
      expect(tracker.acknowledgeStateUpdate(updateId, 2)).toBe(true);
    });
  });

  describe('cleanupDeadRenderer', () => {
    it('should remove dead renderer from pending updates', () => {
      const updateId = 'update-1';
      const renderers = [1, 2, 3];

      tracker.trackStateUpdateForThunk('thunk-1', updateId, renderers);
      tracker.acknowledgeStateUpdate(updateId, 1); // Only renderer 1 acknowledged

      // Remove dead renderer 2
      tracker.cleanupDeadRenderer(2);

      // Now only renderer 3 needs to acknowledge, so acknowledging from 3 should complete
      expect(tracker.acknowledgeStateUpdate(updateId, 3)).toBe(true);
      expect(tracker.getPendingUpdateCount()).toBe(0);
    });

    it('should complete update if all remaining renderers have acknowledged after cleanup', () => {
      const updateId = 'update-1';
      const renderers = [1, 2];

      tracker.trackStateUpdateForThunk('thunk-1', updateId, renderers);
      tracker.acknowledgeStateUpdate(updateId, 1); // Renderer 1 acknowledged

      // Remove dead renderer 2 - update should complete automatically
      tracker.cleanupDeadRenderer(2);

      expect(tracker.getPendingUpdateCount()).toBe(0);
      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(false);
    });

    it('should handle cleanup of non-subscribed renderer gracefully', () => {
      const updateId = 'update-1';
      const renderers = [1, 2];

      tracker.trackStateUpdateForThunk('thunk-1', updateId, renderers);

      // Clean up renderer 3 that wasn't subscribed
      expect(() => tracker.cleanupDeadRenderer(3)).not.toThrow();
      expect(tracker.getPendingUpdateCount()).toBe(1);
    });
  });

  describe('cleanupExpiredUpdates', () => {
    it('should cleanup expired updates based on age', async () => {
      const updateId1 = 'update-1';
      const updateId2 = 'update-2';

      tracker.trackStateUpdateForThunk('thunk-1', updateId1, [1]);
      tracker.trackStateUpdateForThunk('thunk-2', updateId2, [2]);

      expect(tracker.getPendingUpdateCount()).toBe(2);

      // Wait a small amount to ensure timestamps are older
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Clean up updates older than 5ms (all updates should be expired)
      tracker.cleanupExpiredUpdates(5);

      expect(tracker.getPendingUpdateCount()).toBe(0);
      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(false);
      expect(tracker.hasPendingStateUpdates('thunk-2')).toBe(false);
    });

    it('should not cleanup recent updates', () => {
      const updateId = 'update-1';

      tracker.trackStateUpdateForThunk('thunk-1', updateId, [1]);
      expect(tracker.getPendingUpdateCount()).toBe(1);

      // Clean up updates older than 1 hour (should not affect recent updates)
      tracker.cleanupExpiredUpdates(3600000);

      expect(tracker.getPendingUpdateCount()).toBe(1);
      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(true);
    });

    it('should use default max age when not specified', () => {
      const updateId = 'update-1';

      tracker.trackStateUpdateForThunk('thunk-1', updateId, [1]);
      expect(tracker.getPendingUpdateCount()).toBe(1);

      // Should not cleanup recent updates with default 30s timeout
      tracker.cleanupExpiredUpdates();

      expect(tracker.getPendingUpdateCount()).toBe(1);
    });
  });

  describe('hasPendingStateUpdates', () => {
    it('should return false for thunk with no pending updates', () => {
      expect(tracker.hasPendingStateUpdates('non-existent')).toBe(false);
    });

    it('should return true for thunk with pending updates', () => {
      tracker.trackStateUpdateForThunk('thunk-1', 'update-1', [1]);
      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(true);
    });

    it('should return false after all updates are acknowledged', () => {
      const updateId = 'update-1';
      tracker.trackStateUpdateForThunk('thunk-1', updateId, [1]);

      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(true);

      tracker.acknowledgeStateUpdate(updateId, 1);

      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all tracking data', () => {
      tracker.trackStateUpdateForThunk('thunk-1', 'update-1', [1]);
      tracker.trackStateUpdateForThunk('thunk-2', 'update-2', [2]);

      expect(tracker.getPendingUpdateCount()).toBe(2);

      tracker.clear();

      expect(tracker.getPendingUpdateCount()).toBe(0);
      expect(tracker.hasPendingStateUpdates('thunk-1')).toBe(false);
      expect(tracker.hasPendingStateUpdates('thunk-2')).toBe(false);
    });
  });

  describe('getPendingUpdateCount', () => {
    it('should return 0 when no updates are pending', () => {
      expect(tracker.getPendingUpdateCount()).toBe(0);
    });

    it('should return correct count of pending updates', () => {
      tracker.trackStateUpdateForThunk('thunk-1', 'update-1', [1]);
      expect(tracker.getPendingUpdateCount()).toBe(1);

      tracker.trackStateUpdateForThunk('thunk-1', 'update-2', [2]);
      expect(tracker.getPendingUpdateCount()).toBe(2);

      tracker.acknowledgeStateUpdate('update-1', 1);
      expect(tracker.getPendingUpdateCount()).toBe(1);
    });
  });
});
