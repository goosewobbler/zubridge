import { describe, expect, it } from 'vitest';
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

  it('should use a longer completion timeout on Linux', () => {
    const expected = process.platform === 'linux' ? 60000 : 30000;

    expect(THUNK_PROCESSOR_DEFAULTS.actionCompletionTimeoutMs).toBe(expected);
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
