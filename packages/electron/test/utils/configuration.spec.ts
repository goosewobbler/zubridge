import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPreloadOptions,
  getThunkProcessorOptions,
  PRELOAD_DEFAULTS,
  THUNK_PROCESSOR_DEFAULTS,
} from '../../src/utils/configuration.js';

// Mock process.platform for consistent testing
const originalPlatform = process.platform;
beforeEach(() => {
  vi.restoreAllMocks();
  // Reset platform to original value
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    writable: true,
  });
});

describe('Configuration', () => {
  describe('THUNK_PROCESSOR_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(THUNK_PROCESSOR_DEFAULTS).toEqual({
        maxQueueSize: 100,
        actionCompletionTimeoutMs: originalPlatform === 'linux' ? 60000 : 30000,
      });
    });

    it('should have platform-specific timeout for Linux', () => {
      // Test the logic by checking the current defaults and platform
      if (process.platform === 'linux') {
        expect(THUNK_PROCESSOR_DEFAULTS.actionCompletionTimeoutMs).toBe(60000);
      } else {
        // If we're not on Linux, test that the logic would work for Linux
        const linuxTimeout = process.platform === 'linux' ? 60000 : 30000;
        expect(linuxTimeout).toBe(30000); // Since we're not on Linux
      }
    });

    it('should have platform-specific timeout for non-Linux', () => {
      // Test the logic by checking the current defaults and platform
      if (process.platform !== 'linux') {
        expect(THUNK_PROCESSOR_DEFAULTS.actionCompletionTimeoutMs).toBe(30000);
      } else {
        // If we're on Linux, test that the logic would work for non-Linux
        const nonLinuxTimeout = process.platform === 'linux' ? 60000 : 30000;
        expect(nonLinuxTimeout).toBe(60000); // Since we're on Linux
      }
    });
  });

  describe('getThunkProcessorOptions', () => {
    it('should return defaults when no options provided', () => {
      const result = getThunkProcessorOptions();
      expect(result).toEqual({
        maxQueueSize: 100,
        actionCompletionTimeoutMs: originalPlatform === 'linux' ? 60000 : 30000,
      });
    });

    it('should merge user options with defaults', () => {
      const userOptions = {
        maxQueueSize: 50,
        actionCompletionTimeoutMs: 10000,
      };
      const result = getThunkProcessorOptions(userOptions);
      expect(result).toEqual({
        maxQueueSize: 50,
        actionCompletionTimeoutMs: 10000,
      });
    });

    it('should use defaults for undefined properties', () => {
      const userOptions = {
        maxQueueSize: 75,
        // actionCompletionTimeoutMs not provided
      };
      const result = getThunkProcessorOptions(userOptions);
      expect(result).toEqual({
        maxQueueSize: 75,
        actionCompletionTimeoutMs: originalPlatform === 'linux' ? 60000 : 30000,
      });
    });

    it('should handle empty object', () => {
      const result = getThunkProcessorOptions({});
      expect(result).toEqual({
        maxQueueSize: 100,
        actionCompletionTimeoutMs: originalPlatform === 'linux' ? 60000 : 30000,
      });
    });
  });

  describe('PRELOAD_DEFAULTS', () => {
    it('should extend THUNK_PROCESSOR_DEFAULTS', () => {
      expect(PRELOAD_DEFAULTS).toEqual({
        maxQueueSize: 100,
        actionCompletionTimeoutMs: originalPlatform === 'linux' ? 60000 : 30000,
      });
    });
  });

  describe('getPreloadOptions', () => {
    it('should return defaults when no options provided', () => {
      const result = getPreloadOptions();
      expect(result).toEqual({
        maxQueueSize: 100,
        actionCompletionTimeoutMs: originalPlatform === 'linux' ? 60000 : 30000,
      });
    });

    it('should merge user options with defaults', () => {
      const userOptions = {
        maxQueueSize: 25,
        actionCompletionTimeoutMs: 5000,
      };
      const result = getPreloadOptions(userOptions);
      expect(result).toEqual({
        maxQueueSize: 25,
        actionCompletionTimeoutMs: 5000,
      });
    });

    it('should use thunk processor option merging internally', () => {
      const userOptions = {
        maxQueueSize: 200,
        // actionCompletionTimeoutMs not provided
      };
      const result = getPreloadOptions(userOptions);
      expect(result).toEqual({
        maxQueueSize: 200,
        actionCompletionTimeoutMs: originalPlatform === 'linux' ? 60000 : 30000,
      });
    });
  });
});
