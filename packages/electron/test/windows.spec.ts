import type { WebContentsWrapper } from '@zubridge/types';
import type { WebContents } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebContentsTracker,
  getWebContents,
  isDestroyed,
  isWebContents,
  isWrapper,
  prepareWebContents,
  safelySendToWindow,
  setupDestroyListener,
} from '../src/utils/windows';

// Create mock WebContents object
function mockWebContents(id = 1, destroyed = false): WebContents {
  return {
    id,
    isDestroyed: vi.fn(() => destroyed),
    isLoading: vi.fn(() => false),
    send: vi.fn(),
    once: vi.fn(),
  } as unknown as WebContents;
}

// Create mock WebContentsWrapper object
function mockWrapper(id = 1, destroyed = false, webContentsDestroyed = false): WebContentsWrapper {
  return {
    webContents: mockWebContents(id, webContentsDestroyed),
    isDestroyed: vi.fn(() => destroyed),
  };
}

describe('windows.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isWebContents', () => {
    it('should return true for WebContents objects', () => {
      const webContents = mockWebContents();
      expect(isWebContents(webContents)).toBe(true);
    });

    it('should return false for wrapper objects', () => {
      const wrapper = mockWrapper();
      expect(isWebContents(wrapper)).toBe(false);
    });
  });

  describe('isWrapper', () => {
    it('should return true for wrapper objects', () => {
      const wrapper = mockWrapper();
      expect(isWrapper(wrapper)).toBe(true);
    });

    it('should return false for WebContents objects', () => {
      const webContents = mockWebContents();
      expect(isWrapper(webContents)).toBe(false);
    });
  });

  describe('getWebContents', () => {
    it('should return WebContents from a WebContents object', () => {
      const webContents = mockWebContents();
      expect(getWebContents(webContents)).toBe(webContents);
    });

    it('should return WebContents from a wrapper object', () => {
      const wrapper = mockWrapper();
      expect(getWebContents(wrapper)).toBe(wrapper.webContents);
    });

    it('should return undefined for invalid input', () => {
      expect(getWebContents(null as unknown as WebContents)).toBeUndefined();
      expect(getWebContents(undefined as unknown as WebContents)).toBeUndefined();
      expect(getWebContents({} as unknown as WebContents)).toBeUndefined();
    });
  });

  describe('isDestroyed', () => {
    it('should return true for destroyed WebContents', () => {
      const webContents = mockWebContents(1, true);
      expect(isDestroyed(webContents)).toBe(true);
    });

    it('should return false for active WebContents', () => {
      const webContents = mockWebContents(1, false);
      expect(isDestroyed(webContents)).toBe(false);
    });

    it('should return true if isDestroyed throws an error', () => {
      const webContents = mockWebContents();
      vi.mocked(webContents.isDestroyed).mockImplementation(() => {
        throw new Error('Test error');
      });
      expect(isDestroyed(webContents)).toBe(true);
    });

    it('should return false if isDestroyed is not a function', () => {
      const webContents = mockWebContents();
      (webContents as unknown as { isDestroyed: string }).isDestroyed = 'not a function';
      expect(isDestroyed(webContents)).toBe(false);
    });
  });

  describe('safelySendToWindow', () => {
    it('should send message to active WebContents', () => {
      const webContents = mockWebContents();
      const result = safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      expect(result).toBe(true);
      expect(webContents.send).toHaveBeenCalledWith('test-channel', { data: 'test' });
    });

    it('should not send to destroyed WebContents', () => {
      const webContents = mockWebContents(1, true);
      const result = safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      expect(result).toBe(false);
      expect(webContents.send).not.toHaveBeenCalled();
    });

    it('should handle loading WebContents by setting up a listener', () => {
      const webContents = mockWebContents();
      vi.mocked(webContents.isLoading).mockReturnValue(true);

      const result = safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      expect(result).toBe(true);
      expect(webContents.once).toHaveBeenCalledWith('did-finish-load', expect.any(Function));
      expect(webContents.send).not.toHaveBeenCalled();

      // Simulate the load finishing
      const callback = vi.mocked(webContents.once).mock.calls[0][1] as Function;
      callback();

      expect(webContents.send).toHaveBeenCalledWith('test-channel', { data: 'test' });
    });

    it('should handle invalid WebContents', () => {
      expect(safelySendToWindow(null as unknown as WebContents, 'test-channel', {})).toBe(false);
    });

    it('should handle WebContents without a send function', () => {
      const webContents = mockWebContents();
      (webContents as unknown as { send: undefined }).send = undefined;

      const result = safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      expect(result).toBe(false);
    });

    it('should handle WebContents without an isLoading function', () => {
      const webContents = mockWebContents();
      (webContents as unknown as { isLoading: undefined }).isLoading = undefined;

      const result = safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      expect(result).toBe(true);
      expect(webContents.send).toHaveBeenCalledWith('test-channel', { data: 'test' });
    });

    it('should catch errors when sending messages', () => {
      const webContents = mockWebContents();
      vi.mocked(webContents.isLoading).mockReturnValue(true);

      const result = safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      const callback = vi.mocked(webContents.once).mock.calls[0][1] as Function;

      vi.mocked(webContents.isDestroyed).mockReturnValue(false);
      vi.mocked(webContents.send).mockImplementation(() => {
        throw new Error('Send error');
      });

      callback();

      expect(result).toBe(true);
    });

    it('should handle errors when WebContents is destroyed during loading callback', () => {
      const webContents = mockWebContents();
      vi.mocked(webContents.isLoading).mockReturnValue(true);

      // Set up the channel
      safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      // Get the callback
      const callback = vi.mocked(webContents.once).mock.calls[0][1] as Function;

      // Make isDestroyed return true during the callback to trigger the error handling
      vi.mocked(webContents.isDestroyed).mockReturnValue(true);

      // This should not throw
      callback();

      // The send should not be called since isDestroyed returns true
      expect(webContents.send).not.toHaveBeenCalled();
    });

    it('should handle any errors in the loading callback', () => {
      const webContents = mockWebContents();
      vi.mocked(webContents.isLoading).mockReturnValue(true);

      safelySendToWindow(webContents, 'test-channel', { data: 'test' });

      const callback = vi.mocked(webContents.once).mock.calls[0][1] as Function;

      // Make isDestroyed throw an error to trigger the catch block
      vi.mocked(webContents.isDestroyed).mockImplementation(() => {
        throw new Error('isDestroyed error');
      });

      // This should not throw
      callback();

      // Send shouldn't be called since an error was thrown
      expect(webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('setupDestroyListener', () => {
    it('should set up a destroy listener', () => {
      const webContents = mockWebContents();
      const cleanup = vi.fn();

      setupDestroyListener(webContents, cleanup);

      expect(webContents.once).toHaveBeenCalledWith('destroyed', expect.any(Function));

      const onceCallback = vi.mocked(webContents.once).mock.calls[0][1] as Function;
      onceCallback();
      expect(cleanup).toHaveBeenCalled();
    });

    it('should handle WebContents without an once function', () => {
      const webContents = mockWebContents();
      (webContents as unknown as { once: undefined }).once = undefined;
      const cleanup = vi.fn();

      setupDestroyListener(webContents, cleanup);

      expect(cleanup).not.toHaveBeenCalled();
    });

    it('should handle errors when setting up destroy listener', () => {
      const webContents = mockWebContents();
      vi.mocked(webContents.once).mockImplementation(() => {
        throw new Error('Once error');
      });
      const cleanup = vi.fn();

      expect(() => {
        setupDestroyListener(webContents, cleanup);
      }).not.toThrow();
    });
  });

  describe('WebContentsTracker', () => {
    it('should track and retrieve active WebContents', () => {
      const tracker = createWebContentsTracker();
      const webContents1 = mockWebContents(1);
      const webContents2 = mockWebContents(2);

      tracker.track(webContents1);
      tracker.track(webContents2);

      expect(tracker.isTracked(webContents1)).toBe(true);
      expect(tracker.isTracked(webContents2)).toBe(true);
      expect(tracker.hasId(1)).toBe(true);
      expect(tracker.hasId(2)).toBe(true);
      expect(tracker.getActiveIds()).toEqual([1, 2]);
      expect(tracker.getActiveWebContents()).toEqual([webContents1, webContents2]);
    });

    it('should ignore destroyed WebContents during tracking', () => {
      const tracker = createWebContentsTracker();
      const webContents = mockWebContents(1, true);

      const result = tracker.track(webContents);

      expect(result).toBe(false);
      expect(tracker.isTracked(webContents)).toBe(false);
      expect(tracker.hasId(1)).toBe(false);
    });

    it('should untrack WebContents correctly', () => {
      const tracker = createWebContentsTracker();
      const webContents1 = mockWebContents(1);
      const webContents2 = mockWebContents(2);

      tracker.track(webContents1);
      tracker.track(webContents2);
      tracker.untrack(webContents1);

      expect(tracker.isTracked(webContents1)).toBe(false);
      expect(tracker.isTracked(webContents2)).toBe(true);
      expect(tracker.hasId(1)).toBe(false);
      expect(tracker.hasId(2)).toBe(true);
    });

    it('should untrack by ID', () => {
      const tracker = createWebContentsTracker();
      const webContents1 = mockWebContents(1);
      const webContents2 = mockWebContents(2);

      tracker.track(webContents1);
      tracker.track(webContents2);
      tracker.untrackById(1);

      expect(tracker.hasId(1)).toBe(false);
      expect(tracker.hasId(2)).toBe(true);
    });

    it('should cleanup all tracked items', () => {
      const tracker = createWebContentsTracker();
      const webContents1 = mockWebContents(1);
      const webContents2 = mockWebContents(2);

      tracker.track(webContents1);
      tracker.track(webContents2);
      tracker.cleanup();

      expect(tracker.getActiveIds()).toEqual([]);
      expect(tracker.getActiveWebContents()).toEqual([]);
    });

    it('should remove destroyed WebContents from active list', () => {
      const tracker = createWebContentsTracker();
      const webContents1 = mockWebContents(1);
      const webContents2 = mockWebContents(2);

      tracker.track(webContents1);
      tracker.track(webContents2);

      vi.mocked(webContents1.isDestroyed).mockReturnValue(true);

      expect(tracker.getActiveWebContents()).toEqual([webContents2]);
    });

    it('should clean up destroyed WebContents when retrieving active ones', () => {
      const tracker = createWebContentsTracker();
      const webContents1 = mockWebContents(1);
      const webContents2 = mockWebContents(2);

      tracker.track(webContents1);
      tracker.track(webContents2);

      const activeIdsDeleteSpy = vi.spyOn(Set.prototype, 'delete');

      vi.mocked(webContents1.isDestroyed).mockReturnValue(true);

      tracker.getActiveWebContents();

      expect(activeIdsDeleteSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('prepareWebContents', () => {
    it('should extract WebContents from wrappers', () => {
      const webContents1 = mockWebContents(1);
      const wrapper = mockWrapper(2);

      const result = prepareWebContents([webContents1, wrapper]);

      expect(result).toEqual([webContents1, wrapper.webContents]);
    });

    it('should filter out destroyed WebContents', () => {
      const webContents1 = mockWebContents(1, true);
      const wrapper = mockWrapper(2);

      const result = prepareWebContents([webContents1, wrapper]);

      expect(result).toEqual([wrapper.webContents]);
    });

    it('should handle invalid inputs', () => {
      const result = prepareWebContents([
        null as unknown as WebContents,
        undefined as unknown as WebContents,
      ]);
      expect(result).toEqual([]);
    });
  });
});
