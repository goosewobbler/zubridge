import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRendererValidationLevel,
  type RendererValidationLevel,
  validateActionInRenderer,
  validateBatchDispatch,
  validateSingleDispatch,
} from '../../../src/bridge/ipc/validation.js';

describe('validation', () => {
  describe('validateSingleDispatch', () => {
    it('should validate a valid action', () => {
      const result = validateSingleDispatch({
        action: { type: 'TEST_ACTION', __id: 'test-1' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action.type).toBe('TEST_ACTION');
      }
    });

    it('should reject action with missing type', () => {
      const result = validateSingleDispatch({
        action: { __id: 'test-1' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('type');
      }
    });

    it('should reject action with type too long', () => {
      const result = validateSingleDispatch({
        action: { type: 'x'.repeat(201) },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('200');
      }
    });

    it('should accept optional parentId', () => {
      const result = validateSingleDispatch({
        action: { type: 'TEST' },
        parentId: 'parent-123',
      });

      expect(result.success).toBe(true);
    });

    it('should reject parentId that is too long', () => {
      const result = validateSingleDispatch({
        action: { type: 'TEST' },
        parentId: 'x'.repeat(101),
      });

      expect(result.success).toBe(false);
    });
  });

  describe('validateBatchDispatch', () => {
    it('should validate a valid batch', () => {
      const result = validateBatchDispatch({
        batchId: 'batch-123',
        actions: [
          { action: { type: 'ACTION_1' }, id: 'id-1' },
          { action: { type: 'ACTION_2' }, id: 'id-2' },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty actions array', () => {
      const result = validateBatchDispatch({
        batchId: 'batch-123',
        actions: [],
      });

      expect(result.success).toBe(false);
    });

    it('should reject more than 200 actions', () => {
      const actions = Array.from({ length: 201 }, (_, i) => ({
        action: { type: 'TEST' },
        id: `id-${i}`,
      }));

      const result = validateBatchDispatch({
        batchId: 'batch-123',
        actions,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('getRendererValidationLevel', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return "warn" in development by default', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ZUBRIDGE_RENDERER_VALIDATION;

      const level = getRendererValidationLevel();
      expect(level).toBe('warn');
    });

    it('should return "off" in production by default', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ZUBRIDGE_RENDERER_VALIDATION;

      const level = getRendererValidationLevel();
      expect(level).toBe('off');
    });

    it('should respect ZUBRIDGE_RENDERER_VALIDATION env var', () => {
      process.env.NODE_ENV = 'production';
      process.env.ZUBRIDGE_RENDERER_VALIDATION = 'error';

      const level = getRendererValidationLevel();
      expect(level).toBe('error');
    });

    it('should return "off" for invalid env var', () => {
      process.env.NODE_ENV = 'development';
      process.env.ZUBRIDGE_RENDERER_VALIDATION = 'invalid' as RendererValidationLevel;

      const level = getRendererValidationLevel();
      expect(level).toBe('warn'); // Falls back to default for development
    });
  });

  describe('validateActionInRenderer', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should not validate when level is "off"', () => {
      validateActionInRenderer({ type: 123 }, undefined, 'off');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log warning for invalid action in "warn" mode', () => {
      validateActionInRenderer({ type: 123 }, undefined, 'warn');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Zubridge] Invalid action dispatch'),
        expect.any(Object),
      );
    });

    it('should not throw in "warn" mode', () => {
      expect(() => {
        validateActionInRenderer({ type: 123 }, undefined, 'warn');
      }).not.toThrow();
    });

    it('should throw error for invalid action in "error" mode', () => {
      expect(() => {
        validateActionInRenderer({ type: 123 }, undefined, 'error');
      }).toThrow('[Zubridge] Invalid action dispatch');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should not log anything for valid action', () => {
      validateActionInRenderer({ type: 'VALID_ACTION' }, undefined, 'warn');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should validate parentId', () => {
      const longParentId = 'x'.repeat(101);

      expect(() => {
        validateActionInRenderer({ type: 'TEST' }, longParentId, 'error');
      }).toThrow();
    });

    it('should accept valid action with parentId', () => {
      expect(() => {
        validateActionInRenderer({ type: 'TEST' }, 'parent-123', 'error');
      }).not.toThrow();
    });

    it('should include error details in warning', () => {
      validateActionInRenderer({ type: 'x'.repeat(201) }, undefined, 'warn');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: expect.any(Object),
          error: expect.stringContaining('200'),
        }),
      );
    });
  });
});
