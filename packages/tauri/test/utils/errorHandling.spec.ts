import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriCommandError } from '../../src/errors/index.js';
import { logError, logZubridgeError, serializeError } from '../../src/utils/errorHandling.js';

const { debug } = vi.hoisted(() => ({ debug: vi.fn() }));
vi.mock('@zubridge/utils', () => ({ debug }));

describe('errorHandling', () => {
  beforeEach(() => {
    debug.mockClear();
  });

  describe('logError', () => {
    it('should log details and the stack under the context namespace', () => {
      logError('ipc', new Error('boom'), { extra: 1 });

      expect(debug).toHaveBeenCalledWith(
        'ipc:error',
        'Error in ipc:',
        expect.objectContaining({ name: 'Error', message: 'boom', extra: 1 }),
      );
      expect(debug).toHaveBeenCalledWith('ipc:error', 'Stack trace:', expect.any(String));
    });

    it('should normalise non-Error values', () => {
      logError('ipc', 'plain string');

      expect(debug).toHaveBeenCalledWith(
        'ipc:error',
        'Error in ipc:',
        expect.objectContaining({ message: 'plain string' }),
      );
    });
  });

  describe('logZubridgeError', () => {
    it('should derive the namespace from the error class name', () => {
      const error = new TauriCommandError('failed', { command: 'dispatch' });

      logZubridgeError(error, { extra: true });

      expect(debug).toHaveBeenCalledWith(
        'tauricommand:error',
        'TauriCommandError:',
        expect.objectContaining({ message: 'failed', extra: true }),
      );
    });
  });

  describe('serializeError', () => {
    it('should keep context and timestamp from a Zubridge error', () => {
      const error = new TauriCommandError('failed', { command: 'dispatch' });

      expect(serializeError(error)).toEqual({
        name: 'TauriCommandError',
        message: 'failed',
        stack: error.stack,
        timestamp: error.timestamp,
        context: { command: 'dispatch' },
      });
    });

    it('should wrap a native Error', () => {
      const serialized = serializeError(new TypeError('bad'));

      expect(serialized.name).toBe('TypeError');
      expect(serialized.message).toBe('bad');
      expect(typeof serialized.timestamp).toBe('number');
    });

    it('should produce a structured-clone-safe object', () => {
      expect(() => structuredClone(serializeError(new Error('x')))).not.toThrow();
    });
  });
});
