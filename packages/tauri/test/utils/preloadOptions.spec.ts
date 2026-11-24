import { afterEach, describe, expect, it, vi } from 'vitest';
import { BATCHING_DEFAULTS } from '../../src/batching/types.js';
import {
  getBatchingConfig,
  getPreloadOptions,
  PRELOAD_DEFAULTS,
} from '../../src/utils/preloadOptions.js';
import {
  getThunkProcessorOptions,
  THUNK_PROCESSOR_DEFAULTS,
} from '../../src/utils/thunkProcessor.js';

describe('getThunkProcessorOptions', () => {
  it('should return defaults when no options are given', () => {
    expect(getThunkProcessorOptions()).toEqual(THUNK_PROCESSOR_DEFAULTS);
  });

  it('should override only the provided fields', () => {
    expect(getThunkProcessorOptions({ maxQueueSize: 5 })).toEqual({
      maxQueueSize: 5,
      actionCompletionTimeoutMs: THUNK_PROCESSOR_DEFAULTS.actionCompletionTimeoutMs,
    });
  });

  it('should keep explicit zero values', () => {
    expect(getThunkProcessorOptions({ maxQueueSize: 0 }).maxQueueSize).toBe(0);
  });

  describe('platform default timeout', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      vi.resetModules();
    });

    const loadDefaultTimeout = async (platform: NodeJS.Platform): Promise<number> => {
      Object.defineProperty(process, 'platform', { value: platform });
      vi.resetModules();
      const mod = await import('../../src/utils/thunkProcessor.js');
      return mod.THUNK_PROCESSOR_DEFAULTS.actionCompletionTimeoutMs;
    };

    it('should use a longer completion timeout on Linux', async () => {
      await expect(loadDefaultTimeout('linux')).resolves.toBe(60000);
    });

    it('should use the standard completion timeout on other platforms', async () => {
      await expect(loadDefaultTimeout('darwin')).resolves.toBe(30000);
      await expect(loadDefaultTimeout('win32')).resolves.toBe(30000);
    });
  });
});

describe('getBatchingConfig', () => {
  it('should return defaults when no config is given', () => {
    expect(getBatchingConfig()).toEqual(BATCHING_DEFAULTS);
  });

  it('should override only the provided fields', () => {
    expect(getBatchingConfig({ windowMs: 100 })).toEqual({
      ...BATCHING_DEFAULTS,
      windowMs: 100,
    });
  });
});

describe('getPreloadOptions', () => {
  it('should return defaults when no options are given', () => {
    expect(getPreloadOptions()).toEqual({ ...PRELOAD_DEFAULTS, batching: {} });
  });

  it('should merge thunk processor and batching options', () => {
    expect(
      getPreloadOptions({ maxQueueSize: 7, enableBatching: false, batching: { maxBatchSize: 3 } }),
    ).toEqual({
      maxQueueSize: 7,
      actionCompletionTimeoutMs: THUNK_PROCESSOR_DEFAULTS.actionCompletionTimeoutMs,
      enableBatching: false,
      batching: { maxBatchSize: 3 },
    });
  });
});
