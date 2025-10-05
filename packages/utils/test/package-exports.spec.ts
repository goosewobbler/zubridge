import { describe, expect, it } from 'vitest';
import { debug, debugLog } from '../src/index.js';

describe('@zubridge/utils package exports', () => {
  it('should export debug function', () => {
    expect(debug).toBeDefined();
    expect(typeof debug).toBe('function');
  });

  it('should export debugLog function', () => {
    expect(debugLog).toBeDefined();
    expect(typeof debugLog).toBe('function');
  });

  it('should call debug function without errors', () => {
    // Just verify it can be called without throwing
    expect(() => debug('test', 'message')).not.toThrow();
    expect(() => debugLog('test', 'message')).not.toThrow();
  });
});
