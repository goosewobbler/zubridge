import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThunkTracker, getThunkTracker, ThunkState } from '../../src/lib/thunkTracker';

describe('ThunkTracker', () => {
  let tracker: ThunkTracker;

  beforeEach(() => {
    // Create a fresh tracker for each test
    tracker = new ThunkTracker(true);
  });

  afterEach(() => {
    // Clear the tracker after each test
    tracker.clear();
  });

  describe('registerThunk', () => {
    it('should register a new thunk and return a handle with control functions', () => {
      // Register a new thunk
      const handle = tracker.registerThunk();

      // Verify the handle has the expected functions
      expect(handle.thunkId).toBeDefined();
      expect(typeof handle.markExecuting).toBe('function');
      expect(typeof handle.markCompleted).toBe('function');
      expect(typeof handle.markFailed).toBe('function');
      expect(typeof handle.addChildThunk).toBe('function');
      expect(typeof handle.childCompleted).toBe('function');
      expect(typeof handle.addAction).toBe('function');
      expect(typeof handle.setSourceWindowId).toBe('function');

      // Verify the thunk was registered in the tracker
      const record = tracker.getThunkRecord(handle.thunkId);
      expect(record).toBeDefined();
      expect(record?.state).toBe(ThunkState.PENDING);
    });

    it('should register a thunk with a parent', () => {
      // Register a parent thunk
      const parentHandle = tracker.registerThunk();

      // Register a child thunk with the parent ID
      const childHandle = tracker.registerThunk(parentHandle.thunkId);

      // Verify parent-child relationship
      const parentRecord = tracker.getThunkRecord(parentHandle.thunkId);
      const childRecord = tracker.getThunkRecord(childHandle.thunkId);

      expect(childRecord?.parentId).toBe(parentHandle.thunkId);
      expect(parentRecord?.childIds.has(childHandle.thunkId)).toBe(true);
      expect(parentRecord?.pendingChildIds.has(childHandle.thunkId)).toBe(true);
    });
  });

  describe('thunk lifecycle', () => {
    it('should track thunk execution state transitions', () => {
      // Register a thunk
      const handle = tracker.registerThunk();

      // Verify initial state
      let record = tracker.getThunkRecord(handle.thunkId);
      expect(record?.state).toBe(ThunkState.PENDING);

      // Mark as executing
      handle.markExecuting();
      record = tracker.getThunkRecord(handle.thunkId);
      expect(record?.state).toBe(ThunkState.EXECUTING);
      expect(tracker.hasActiveThunks()).toBe(true);

      // Mark as completed
      const result = { success: true };
      handle.markCompleted(result);
      record = tracker.getThunkRecord(handle.thunkId);
      expect(record?.state).toBe(ThunkState.COMPLETED);
      expect(record?.result).toBe(result);
      expect(record?.endTime).toBeGreaterThanOrEqual(record?.startTime || 0);
      expect(tracker.hasActiveThunks()).toBe(false);
    });

    it('should track failed thunks', () => {
      // Register a thunk
      const handle = tracker.registerThunk();

      // Mark as executing
      handle.markExecuting();
      expect(tracker.isThunkActive(handle.thunkId)).toBe(true);

      // Mark as failed
      const error = new Error('Test error');
      handle.markFailed(error);

      // Verify state
      const record = tracker.getThunkRecord(handle.thunkId);
      expect(record?.state).toBe(ThunkState.FAILED);
      expect(record?.error).toBe(error);
      expect(tracker.hasActiveThunks()).toBe(false);
      expect(tracker.isThunkActive(handle.thunkId)).toBe(false);
    });
  });

  describe('parent-child relationships', () => {
    it('should track parent-child relationships between thunks', () => {
      // Register parent and child thunks
      const parentHandle = tracker.registerThunk();
      const childHandle = tracker.registerThunk(parentHandle.thunkId);

      // Mark child as executing
      childHandle.markExecuting();

      // Verify parent knows about the executing child
      expect(tracker.hasPendingChildren(parentHandle.thunkId)).toBe(true);

      // Complete the child
      childHandle.markCompleted();

      // Verify parent knows child is done
      expect(tracker.hasPendingChildren(parentHandle.thunkId)).toBe(false);
    });

    it('should handle direct child registration via the handle', () => {
      // Register two thunks separately
      const parentHandle = tracker.registerThunk();
      const childHandle = tracker.registerThunk();

      // Connect them using the parent handle
      parentHandle.addChildThunk(childHandle.thunkId);

      // Verify they're connected
      expect(tracker.hasPendingChildren(parentHandle.thunkId)).toBe(true);

      // Notify completion through the handle
      parentHandle.childCompleted(childHandle.thunkId);

      // Verify relationship is updated
      expect(tracker.hasPendingChildren(parentHandle.thunkId)).toBe(false);
    });
  });

  describe('action tracking', () => {
    it('should track actions associated with thunks', () => {
      // Register a thunk
      const handle = tracker.registerThunk();

      // Add some actions
      handle.addAction('action-1');
      handle.addAction('action-2');

      // Verify actions were tracked
      const record = tracker.getThunkRecord(handle.thunkId);
      expect(record?.actionIds.has('action-1')).toBe(true);
      expect(record?.actionIds.has('action-2')).toBe(true);

      // Get all actions
      const actions = tracker.getAllActionsForThunk(handle.thunkId);
      expect(actions).toContain('action-1');
      expect(actions).toContain('action-2');
    });

    it('should get all actions from a thunk and its descendants', () => {
      // Create a thunk hierarchy
      const parentHandle = tracker.registerThunk();
      const childHandle = tracker.registerThunk(parentHandle.thunkId);

      // Add actions to parent and child
      parentHandle.addAction('parent-action-1');
      parentHandle.addAction('parent-action-2');
      childHandle.addAction('child-action-1');

      // Get all actions from the parent
      const allActions = tracker.getAllActionsForThunk(parentHandle.thunkId);

      // Verify all actions are included
      expect(allActions).toContain('parent-action-1');
      expect(allActions).toContain('parent-action-2');
      expect(allActions).toContain('child-action-1');
      expect(allActions.length).toBe(3);
    });
  });

  describe('window tracking', () => {
    it('should track thunks by source window ID', () => {
      // Register thunks for different windows
      const window1Thunk = tracker.registerThunk();
      const window2Thunk = tracker.registerThunk();

      // Set window IDs
      window1Thunk.setSourceWindowId(1);
      window2Thunk.setSourceWindowId(2);

      // Mark as executing
      window1Thunk.markExecuting();
      window2Thunk.markExecuting();

      // Check active thunks by window
      expect(tracker.hasActiveThunksForWindow(1)).toBe(true);
      expect(tracker.hasActiveThunksForWindow(2)).toBe(true);
      expect(tracker.hasActiveThunksForWindow(3)).toBe(false);

      // Complete one thunk
      window1Thunk.markCompleted();

      // Verify window status updated
      expect(tracker.hasActiveThunksForWindow(1)).toBe(false);
      expect(tracker.hasActiveThunksForWindow(2)).toBe(true);
    });

    it('should get active thunks for a specific window', () => {
      // Register thunks for the same window
      const thunk1 = tracker.registerThunk();
      const thunk2 = tracker.registerThunk();

      // Set window IDs and mark as executing
      thunk1.setSourceWindowId(1);
      thunk2.setSourceWindowId(1);
      thunk1.markExecuting();
      thunk2.markExecuting();

      // Get active thunks for window
      const activeThunks = tracker.getActiveThunksForWindow(1);

      // Verify both thunks are returned
      expect(activeThunks.length).toBe(2);
      expect(activeThunks[0].id).toBe(thunk1.thunkId);
      expect(activeThunks[1].id).toBe(thunk2.thunkId);
    });
  });

  describe('state change notifications', () => {
    it('should notify subscribers of thunk state changes', () => {
      // Create a mock listener
      const listener = vi.fn();

      // Subscribe to state changes
      const unsubscribe = tracker.onStateChange(listener);

      // Register a thunk and change its state
      const handle = tracker.registerThunk();
      handle.markExecuting();
      handle.markCompleted('result');

      // Verify listener was called for each state change
      expect(listener).toHaveBeenCalledTimes(2);

      // First call: PENDING -> EXECUTING
      const firstCall = listener.mock.calls[0];
      expect(firstCall[0]).toBe(handle.thunkId);
      expect(firstCall[1]).toBe(ThunkState.EXECUTING);

      // Second call: EXECUTING -> COMPLETED
      const secondCall = listener.mock.calls[1];
      expect(secondCall[0]).toBe(handle.thunkId);
      expect(secondCall[1]).toBe(ThunkState.COMPLETED);

      // Unsubscribe
      unsubscribe();

      // Register another thunk and change state
      const anotherHandle = tracker.registerThunk();
      anotherHandle.markExecuting();

      // Verify listener wasn't called again
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('registerThunkWithId', () => {
    it('should register a thunk with a specific ID', () => {
      // Register a thunk with custom ID
      const customId = 'custom-thunk-id';
      const handle = tracker.registerThunkWithId(customId);

      // Verify the ID was used
      expect(handle.thunkId).toBe(customId);

      // Verify the thunk was registered
      const record = tracker.getThunkRecord(customId);
      expect(record).toBeDefined();
      expect(record?.id).toBe(customId);
    });
  });

  describe('getThunkTracker', () => {
    it('should return a singleton instance', () => {
      // Clear any existing global tracker
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Get the tracker twice
      const tracker1 = getThunkTracker();
      const tracker2 = getThunkTracker();

      // Verify it's the same instance
      expect(tracker1).toBe(tracker2);
    });
  });

  describe('global state version', () => {
    it('should increment state version on thunk state changes', () => {
      // Get initial version
      const initialVersion = tracker.getStateVersion();

      // Register and execute a thunk
      const handle = tracker.registerThunk();
      handle.markExecuting();

      // Version should have increased
      const afterExecutingVersion = tracker.getStateVersion();
      expect(afterExecutingVersion).toBeGreaterThan(initialVersion);

      // Complete the thunk
      handle.markCompleted();

      // Version should increase again
      const afterCompletedVersion = tracker.getStateVersion();
      expect(afterCompletedVersion).toBeGreaterThan(afterExecutingVersion);
    });

    it('should include state version in active thunks summary', () => {
      // Register and execute a thunk
      const handle = tracker.registerThunk();
      handle.markExecuting();
      handle.setSourceWindowId(42);

      // Get summary
      const summary = tracker.getActiveThunksSummary();

      // Verify summary structure
      expect(summary.version).toBe(tracker.getStateVersion());
      expect(summary.thunks.length).toBe(1);
      expect(summary.thunks[0].id).toBe(handle.thunkId);
      expect(summary.thunks[0].windowId).toBe(42);
    });
  });
});
