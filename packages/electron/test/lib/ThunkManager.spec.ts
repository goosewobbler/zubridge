import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThunkState } from '@zubridge/types';
import { ThunkManager, ThunkManagerEvent } from '../../src/lib/ThunkManager.js';
import { Thunk as ThunkClass } from '../../src/lib/Thunk.js';

describe('ThunkManager', () => {
  let thunkManager: ThunkManager;

  beforeEach(() => {
    thunkManager = new ThunkManager();
    vi.clearAllMocks();
  });

  describe('thunk registration', () => {
    it('should register a new thunk', () => {
      const thunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const thunkHandle = thunkManager.registerThunk(thunk);
      expect(thunkHandle.thunkId).toBeDefined();
      expect(thunkManager.hasThunk(thunkHandle.thunkId)).toBe(true);
    });

    it('should register a thunk with a specific ID', () => {
      const customId = 'custom-thunk-id';
      const thunk = new ThunkClass({ id: customId, sourceWindowId: 0, type: 'main' });
      const thunkHandle = thunkManager.registerThunk(thunk);
      expect(thunkHandle.thunkId).toBe(customId);
      expect(thunkManager.hasThunk(customId)).toBe(true);
    });

    it('should register a child thunk', () => {
      const parentThunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const parentHandle = thunkManager.registerThunk(parentThunk);
      const childThunk = new ThunkClass({ sourceWindowId: 0, type: 'main', parentId: parentHandle.thunkId });
      const childHandle = thunkManager.registerThunk(childThunk);

      // Get the parent thunk and check if it has the child
      const parentThunkObj = thunkManager.getThunk(parentHandle.thunkId);
      expect(parentThunkObj).toBeDefined();
      expect(parentThunkObj!.getChildren()).toContain(childHandle.thunkId);
    });
  });

  describe('thunk state management', () => {
    it('should mark a thunk as executing', () => {
      const thunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const thunkHandle = thunkManager.registerThunk(thunk);
      thunkHandle.markExecuting();

      const thunkObj = thunkManager.getThunk(thunkHandle.thunkId);
      expect(thunkObj!.state).toBe(ThunkState.EXECUTING);
    });

    it('should mark a thunk as completed', () => {
      const thunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const thunkHandle = thunkManager.registerThunk(thunk);
      thunkHandle.markExecuting();
      thunkHandle.markCompleted();

      const thunkObj = thunkManager.getThunk(thunkHandle.thunkId);
      expect(thunkObj!.state).toBe(ThunkState.COMPLETED);
    });

    it('should mark a thunk as failed', () => {
      const thunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const thunkHandle = thunkManager.registerThunk(thunk);
      thunkHandle.markExecuting();
      thunkHandle.markFailed(new Error('Test error'));

      const thunkObj = thunkManager.getThunk(thunkHandle.thunkId);
      expect(thunkObj!.state).toBe(ThunkState.FAILED);
    });
  });

  describe('window ID management', () => {
    it('should set the source window ID for a thunk', () => {
      const thunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const thunkHandle = thunkManager.registerThunk(thunk);
      const windowId = 12345;

      thunkHandle.setSourceWindowId(windowId);

      const thunkObj = thunkManager.getThunk(thunkHandle.thunkId);
      expect(thunkObj!.sourceWindowId).toBe(windowId);
    });
  });

  describe('active thunk summaries', () => {
    it('should return active thunks summary', () => {
      // Register multiple thunks in different states
      const t1 = new ThunkClass({ sourceWindowId: 1, type: 'main' });
      const t2 = new ThunkClass({ sourceWindowId: 2, type: 'main' });
      const t3 = new ThunkClass({ sourceWindowId: 3, type: 'main' });
      const thunk1 = thunkManager.registerThunk(t1);
      const thunk2 = thunkManager.registerThunk(t2);
      const thunk3 = thunkManager.registerThunk(t3);

      // Set window IDs
      thunk1.setSourceWindowId(1);
      thunk2.setSourceWindowId(2);
      thunk3.setSourceWindowId(3);

      // Mark thunks in different states
      thunk1.markExecuting();
      thunk2.markExecuting();
      thunk3.markExecuting();
      thunk3.markCompleted();

      // Get the summary
      const summary = thunkManager.getActiveThunksSummary();

      // Should only include executing thunks
      expect(summary.thunks.length).toBe(2);
      expect(summary.thunks.map((t) => t.id)).toContain(thunk1.thunkId);
      expect(summary.thunks.map((t) => t.id)).toContain(thunk2.thunkId);
      expect(summary.thunks.map((t) => t.id)).not.toContain(thunk3.thunkId);

      // Should include the version
      expect(summary.version).toBeGreaterThan(0);
    });
  });

  describe('thunk tree management', () => {
    it('should check if a thunk tree is complete', () => {
      // Create parent thunk
      const parentThunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const parentHandle = thunkManager.registerThunk(parentThunk);

      // Create two child thunks
      const child1Thunk = new ThunkClass({ sourceWindowId: 0, type: 'main', parentId: parentHandle.thunkId });
      const child2Thunk = new ThunkClass({ sourceWindowId: 0, type: 'main', parentId: parentHandle.thunkId });
      const child1Handle = thunkManager.registerThunk(child1Thunk);
      const child2Handle = thunkManager.registerThunk(child2Thunk);

      // Mark parent as completed
      parentHandle.markExecuting();
      parentHandle.markCompleted();

      // Tree should not be complete if children are not completed
      expect(thunkManager.isThunkTreeComplete(parentHandle.thunkId)).toBe(false);

      // Mark child1 as completed
      child1Handle.markExecuting();
      child1Handle.markCompleted();

      // Tree should still not be complete
      expect(thunkManager.isThunkTreeComplete(parentHandle.thunkId)).toBe(false);

      // Mark child2 as completed
      child2Handle.markExecuting();
      child2Handle.markCompleted();

      // Now tree should be complete
      expect(thunkManager.isThunkTreeComplete(parentHandle.thunkId)).toBe(true);
    });
  });

  describe('root thunk locking', () => {
    it('should process thunk actions sequentially', () => {
      // Create two thunks
      const t1 = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const t2 = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const thunk1 = thunkManager.registerThunk(t1);
      const thunk2 = thunkManager.registerThunk(t2);

      // Create mock actions
      const action1 = { type: 'ACTION1', id: '1', __thunkParentId: thunk1.thunkId };
      const action2 = { type: 'ACTION2', id: '2', __thunkParentId: thunk2.thunkId };

      // Try to acquire lock for first thunk action
      const acquired1 = thunkManager.tryAcquireThunkLock(action1);
      expect(acquired1).toBe(true);

      // Should not be able to acquire lock for second thunk while first is active
      const acquired2 = thunkManager.tryAcquireThunkLock(action2);
      expect(acquired2).toBe(false);

      // Check canProcessAction
      expect(thunkManager.canProcessAction(action1)).toBe(true);
      expect(thunkManager.canProcessAction(action2)).toBe(false);

      // Mark first thunk as completed
      thunk1.markExecuting();
      thunk1.markCompleted();

      // Release lock
      thunkManager.checkAndReleaseRootThunkLock(thunk1.thunkId);

      // Now should be able to acquire lock for second thunk
      const acquiredAfterRelease = thunkManager.tryAcquireThunkLock(action2);
      expect(acquiredAfterRelease).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit events on thunk state changes', () => {
      const registeredHandler = vi.fn();
      const startedHandler = vi.fn();
      const completedHandler = vi.fn();

      thunkManager.on(ThunkManagerEvent.THUNK_REGISTERED, registeredHandler);
      thunkManager.on(ThunkManagerEvent.THUNK_STARTED, startedHandler);
      thunkManager.on(ThunkManagerEvent.THUNK_COMPLETED, completedHandler);

      const thunk = new ThunkClass({ sourceWindowId: 0, type: 'main' });
      const thunkHandle = thunkManager.registerThunk(thunk);
      expect(registeredHandler).toHaveBeenCalled();

      thunkHandle.markExecuting();
      expect(startedHandler).toHaveBeenCalled();

      thunkHandle.markCompleted();
      expect(completedHandler).toHaveBeenCalled();
    });
  });
});
