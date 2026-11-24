import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DebugModule = typeof import('../src/utils/debug.js');

const wealdInstance = vi.fn();
const wealdFactory = vi.fn((_namespace: string) => wealdInstance);

const loadModule = async (): Promise<DebugModule> => {
  vi.resetModules();
  vi.doMock('weald', () => ({ default: wealdFactory }));
  return import('../src/utils/debug.js');
};

const flushPromises = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('debug', () => {
  beforeEach(() => {
    vi.stubEnv('DEBUG', '');
    vi.stubEnv('WDIO', '');
    vi.stubEnv('WDIO_LOG_LEVEL', '');
    wealdInstance.mockClear();
    wealdFactory.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock('weald');
    vi.doUnmock('@wdio/logger');
  });

  describe('isDebugEnabled', () => {
    it('is false when neither DEBUG nor localStorage is set', async () => {
      const { isDebugEnabled } = await loadModule();

      expect(isDebugEnabled()).toBe(false);
    });

    it.each([
      ['*', true],
      ['zubridge:*', true],
      ['zubridge:ipc,other:*', true],
      ['other:*', false],
    ])('reads DEBUG=%s from the environment', async (pattern, expected) => {
      vi.stubEnv('DEBUG', pattern);
      const { isDebugEnabled } = await loadModule();

      expect(isDebugEnabled()).toBe(expected);
    });

    it.each([
      ['*', true],
      ['zubridge:*', true],
      ['other:*', false],
      [null, false],
    ])('reads localStorage debug=%s when DEBUG is unset', async (stored, expected) => {
      vi.stubGlobal('localStorage', { getItem: () => stored });
      const { isDebugEnabled } = await loadModule();

      expect(isDebugEnabled()).toBe(expected);
    });

    it('is false when localStorage access throws', async () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('blocked');
        },
      });
      const { isDebugEnabled } = await loadModule();

      expect(isDebugEnabled()).toBe(false);
    });
  });

  describe('debugLog', () => {
    it('does not call weald when debugging is disabled', async () => {
      const { debugLog } = await loadModule();

      debugLog('ipc', 'message');

      expect(wealdFactory).not.toHaveBeenCalled();
      expect(wealdInstance).not.toHaveBeenCalled();
    });

    it('logs through weald under the zubridge namespace when enabled', async () => {
      vi.stubEnv('DEBUG', 'zubridge:*');
      const { debugLog } = await loadModule();

      debugLog('ipc', 'sent %s', 'action');

      expect(wealdFactory).toHaveBeenCalledWith('zubridge:ipc');
      expect(wealdInstance).toHaveBeenCalledWith('sent %s', 'action');
    });

    it('creates one weald instance per namespace and reuses it', async () => {
      vi.stubEnv('DEBUG', '*');
      const { debugLog } = await loadModule();

      debugLog('ipc', 'first');
      debugLog('ipc', 'second');
      debugLog('custom-area', 'third');

      expect(wealdFactory).toHaveBeenCalledTimes(2);
      expect(wealdFactory).toHaveBeenNthCalledWith(1, 'zubridge:ipc');
      expect(wealdFactory).toHaveBeenNthCalledWith(2, 'zubridge:custom-area');
      expect(wealdInstance).toHaveBeenCalledTimes(3);
    });

    it('exports debug as an alias of debugLog', async () => {
      const mod = await loadModule();

      expect(mod.debug).toBe(mod.debugLog);
    });
  });

  describe('in a WDIO environment', () => {
    const wdioLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };

    beforeEach(() => {
      vi.stubEnv('WDIO', 'true');
      vi.stubEnv('DEBUG', 'zubridge:*');
      for (const fn of Object.values(wdioLogger)) {
        fn.mockClear();
      }
    });

    it('routes logs to @wdio/logger by namespace suffix instead of weald', async () => {
      vi.doMock('@wdio/logger', () => ({ default: () => wdioLogger }));
      const { debugLog } = await loadModule();
      await flushPromises();

      debugLog('core:error', 'e');
      debugLog('core:warn', 'w');
      debugLog('core:info', 'i');
      debugLog('core', 'd');

      expect(wdioLogger.error).toHaveBeenCalledWith('zubridge:core:error', 'e');
      expect(wdioLogger.warn).toHaveBeenCalledWith('zubridge:core:warn', 'w');
      expect(wdioLogger.info).toHaveBeenCalledWith('zubridge:core:info', 'i');
      expect(wdioLogger.debug).toHaveBeenCalledWith('zubridge:core', 'd');
      expect(wealdFactory).not.toHaveBeenCalled();
    });

    it('holds logs made before @wdio/logger loads and sends them to it', async () => {
      vi.doMock('@wdio/logger', () => ({ default: () => wdioLogger }));
      const { debugLog } = await loadModule();

      debugLog('core', 'early');
      expect(wdioLogger.debug).not.toHaveBeenCalled();

      await flushPromises();

      expect(wdioLogger.debug).toHaveBeenCalledWith('zubridge:core', 'early');
      expect(wealdFactory).not.toHaveBeenCalled();
    });

    it('falls back to weald when @wdio/logger cannot be loaded', async () => {
      vi.doMock('@wdio/logger', () => {
        throw new Error('not installed');
      });
      const { debugLog } = await loadModule();

      debugLog('core', 'early');
      await flushPromises();
      debugLog('core', 'late');

      expect(wealdFactory).toHaveBeenCalledWith('zubridge:core');
      expect(wealdInstance).toHaveBeenCalledWith('early');
      expect(wealdInstance).toHaveBeenCalledWith('late');
    });
  });
});
