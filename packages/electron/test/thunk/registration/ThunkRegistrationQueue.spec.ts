import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IpcChannel,
  ThunkRegistrationQueue,
} from '../../../src/thunk/registration/ThunkRegistrationQueue.js';
import { Thunk } from '../../../src/thunk/Thunk.js';
import type { ThunkManager } from '../../../src/thunk/ThunkManager.js';
import { ThunkManagerEvent } from '../../../src/thunk/ThunkManager.js';

// Mock ThunkManager
const createMockThunkManager = () => {
  const emitter = new EventEmitter();
  return {
    ...emitter,
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    eventNames: emitter.eventNames.bind(emitter),
    canProcessActionImmediately: vi.fn().mockReturnValue(true),
    getCurrentRootThunkId: vi.fn().mockReturnValue(undefined),
    getActiveThunksSummary: vi.fn().mockReturnValue({ thunks: [] }),
    registerThunk: vi.fn(),
    executeThunk: vi.fn(),
    markThunkExecuting: vi.fn(),
    completeThunk: vi.fn(),
    failThunk: vi.fn(),
    markThunkFailed: vi.fn(),
  };
};

describe('ThunkRegistrationQueue', () => {
  let queue: ThunkRegistrationQueue;
  let mockThunkManager: ReturnType<typeof createMockThunkManager>;

  beforeEach(() => {
    mockThunkManager = createMockThunkManager();
    queue = new ThunkRegistrationQueue(mockThunkManager as unknown as ThunkManager);
    vi.clearAllMocks();
  });

  const createMockThunk = (overrides: Partial<Thunk> = {}): Thunk => {
    const thunk = new Thunk({
      id: 'test-thunk',
      sourceWindowId: 1,
      source: 'main',
    });

    // Apply overrides
    Object.assign(thunk, overrides);

    return thunk;
  };

  describe('constructor', () => {
    it('should initialize and listen to thunk manager events', () => {
      expect(queue).toBeInstanceOf(ThunkRegistrationQueue);

      // Verify event listeners were set up
      const listeners = mockThunkManager.eventNames();
      expect(listeners.length).toBeGreaterThan(0);
    });

    it('should process next registration on ROOT_THUNK_COMPLETED', () => {
      const processSpy = vi.spyOn(queue, 'processNextThunkRegistration');

      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);

      expect(processSpy).toHaveBeenCalled();
    });

    it('should process next registration on THUNK_STARTED for bypass thunks', () => {
      const processSpy = vi.spyOn(queue, 'processNextThunkRegistration');

      mockThunkManager.emit(ThunkManagerEvent.THUNK_STARTED);

      expect(processSpy).toHaveBeenCalled();
    });
  });

  describe('registerThunk', () => {
    it('should register thunk immediately when can process', async () => {
      const thunk = createMockThunk();
      const mainCallback = vi.fn().mockResolvedValue('result');

      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });

      const result = await queue.registerThunk(thunk, mainCallback);

      expect(result).toBe('result');
      expect(mainCallback).toHaveBeenCalled();
      expect(mockThunkManager.registerThunk).toHaveBeenCalled();
    });

    it('should queue thunk when cannot process immediately', () => {
      const thunk = createMockThunk();
      const mainCallback = vi.fn().mockResolvedValue('result');

      // Set up scheduler to have active thunks (cannot process immediately)
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [{ id: 'active-thunk' }] });

      const promise = queue.registerThunk(thunk, mainCallback);

      // Should return a pending promise
      expect(promise).toBeInstanceOf(Promise);

      // Thunk should be queued but not processed yet
      expect(mainCallback).not.toHaveBeenCalled();
      expect(mockThunkManager.registerThunk).not.toHaveBeenCalled();
    });

    it('should handle thunk registration with renderer callback', async () => {
      const thunk = createMockThunk({ source: 'renderer' });
      const rendererCallback = vi.fn();

      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });

      await queue.registerThunk(thunk, undefined, rendererCallback);

      expect(rendererCallback).toHaveBeenCalled();
      expect(mockThunkManager.registerThunk).toHaveBeenCalled();
    });

    it('should handle thunk registration without callbacks', async () => {
      const thunk = createMockThunk({ source: 'renderer' });

      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });

      const result = await queue.registerThunk(thunk);

      expect(result).toBe(null);
      expect(mockThunkManager.registerThunk).toHaveBeenCalled();
    });

    it('should handle main callback errors', async () => {
      const thunk = createMockThunk();
      const error = new Error('Callback failed');
      const mainCallback = vi.fn().mockRejectedValue(error);

      mockThunkManager.canProcessActionImmediately.mockReturnValue(true);

      await expect(queue.registerThunk(thunk, mainCallback)).rejects.toThrow('Callback failed');

      expect(mainCallback).toHaveBeenCalled();
    });

    it('should handle bypass thunk lock', async () => {
      const thunk = createMockThunk();
      thunk.bypassThunkLock = true;

      const mainCallback = vi.fn().mockResolvedValue('bypass-result');

      // Even if there's an active thunk, bypass should work
      mockThunkManager.canProcessActionImmediately.mockReturnValue(false);
      mockThunkManager.getCurrentRootThunkId.mockReturnValue('active-thunk');

      const result = await queue.registerThunk(thunk, mainCallback);

      expect(result).toBe('bypass-result');
      expect(mainCallback).toHaveBeenCalled();
    });
  });

  describe('processNextThunkRegistration', () => {
    it('should process queued thunk when available', async () => {
      const thunk = createMockThunk();
      const mainCallback = vi.fn().mockResolvedValue('queued-result');

      // First, queue a thunk
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [{ id: 'active-thunk' }] });

      const promise = queue.registerThunk(thunk, mainCallback);

      // Now make it available for processing
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });

      // Trigger processing
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);

      const result = await promise;

      expect(result).toBe('queued-result');
      expect(mainCallback).toHaveBeenCalled();
      expect(mockThunkManager.registerThunk).toHaveBeenCalled();
    });

    it('should not process when already processing', async () => {
      const thunk1 = createMockThunk({ id: 'thunk-1' });
      const thunk2 = createMockThunk({ id: 'thunk-2' });

      const callback1 = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('result1'), 50)),
        );
      const callback2 = vi.fn().mockResolvedValue('result2');

      // Queue both thunks
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [{ id: 'active-thunk' }] });

      const promise1 = queue.registerThunk(thunk1, callback1);
      const promise2 = queue.registerThunk(thunk2, callback2);

      // Make processing available
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });

      // Trigger processing multiple times quickly
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);

      await promise1;

      // Only first callback should have been called initially
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();

      // Process next
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);
      await promise2;

      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle processing errors gracefully', async () => {
      const thunk = createMockThunk();
      const error = new Error('Processing failed');
      const mainCallback = vi.fn().mockRejectedValue(error);

      // Queue the thunk
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [{ id: 'active-thunk' }] });

      const promise = queue.registerThunk(thunk, mainCallback);

      // Make processing available and trigger
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);

      await expect(promise).rejects.toThrow('Processing failed');

      // Queue should continue to work for next thunk
      const thunk2 = createMockThunk({ id: 'thunk-2' });
      const callback2 = vi.fn().mockResolvedValue('success');

      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [{ id: 'active-thunk' }] });
      const promise2 = queue.registerThunk(thunk2, callback2);

      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);

      const result2 = await promise2;
      expect(result2).toBe('success');
    });
  });

  // Note: canProcessThunkImmediately is a private method and tested through public methods

  // Note: executeThunkImmediately is a private method and tested through public methods

  describe('IpcChannel enum', () => {
    it('should have correct IPC channel constants', () => {
      expect(IpcChannel.REGISTER_THUNK).toBe('__zubridge_register_thunk');
      expect(IpcChannel.REGISTER_THUNK_ACK).toBe('__zubridge_register_thunk_ack');
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple queued thunks in order', async () => {
      const results: string[] = [];

      const thunk1 = createMockThunk({ id: 'thunk-1' });
      const thunk2 = createMockThunk({ id: 'thunk-2' });
      const thunk3 = createMockThunk({ id: 'thunk-3' });

      const callback1 = vi.fn().mockImplementation(async () => {
        results.push('thunk-1');
        return 'result-1';
      });
      const callback2 = vi.fn().mockImplementation(async () => {
        results.push('thunk-2');
        return 'result-2';
      });
      const callback3 = vi.fn().mockImplementation(async () => {
        results.push('thunk-3');
        return 'result-3';
      });

      // All thunks need to be queued
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [{ id: 'active-thunk' }] });

      const promise1 = queue.registerThunk(thunk1, callback1);
      const promise2 = queue.registerThunk(thunk2, callback2);
      const promise3 = queue.registerThunk(thunk3, callback3);

      // Enable processing and trigger events sequentially
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });

      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);
      await promise1;

      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);
      await promise2;

      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);
      await promise3;

      expect(results).toEqual(['thunk-1', 'thunk-2', 'thunk-3']);
    });

    it('should handle mix of immediate and queued thunks', async () => {
      const results: string[] = [];

      // First thunk can execute immediately
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });
      const immediateThunk = createMockThunk({ id: 'immediate' });
      const immediateResult = await queue.registerThunk(immediateThunk, async () => {
        results.push('immediate');
        return 'immediate-result';
      });

      expect(immediateResult).toBe('immediate-result');
      expect(results).toEqual(['immediate']);

      // Second thunk needs to be queued
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [{ id: 'active-thunk' }] });
      const queuedThunk = createMockThunk({ id: 'queued' });
      const queuedPromise = queue.registerThunk(queuedThunk, async () => {
        results.push('queued');
        return 'queued-result';
      });

      // Enable processing and trigger
      mockThunkManager.getActiveThunksSummary.mockReturnValue({ thunks: [] });
      mockThunkManager.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED);

      const queuedResult = await queuedPromise;
      expect(queuedResult).toBe('queued-result');
      expect(results).toEqual(['immediate', 'queued']);
    });
  });
});
