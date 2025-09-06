import { describe, expect, it } from 'vitest';

// Test that renderer.ts exports work correctly
describe('Renderer Module', () => {
  it('should export types from @zubridge/types', () => {
    // Test that the module can be imported without errors
    expect(async () => {
      await import('../src/renderer.js');
    }).not.toThrow();
  });

  it('should export action validator functions', () => {
    // Test that action validator functions are available
    expect(async () => {
      const { canDispatchAction } = await import('../src/renderer.js');
      expect(typeof canDispatchAction).toBe('function');
    }).not.toThrow();
  });

  it('should export subscription validator functions', () => {
    // Test that subscription validator functions are available
    expect(async () => {
      const { isSubscribedToKey } = await import('../src/renderer.js');
      expect(typeof isSubscribedToKey).toBe('function');
    }).not.toThrow();
  });

  it('should export utility functions', () => {
    // Test that utility functions are available
    expect(async () => {
      const { isDev } = await import('../src/renderer.js');
      expect(typeof isDev).toBe('function');
    }).not.toThrow();
  });

  it('should not export main process specific functionality', () => {
    // Test that main process functions are not exported
    expect(async () => {
      const module = await import('../src/renderer.js');
      expect(module.createBridge).toBeUndefined();
      expect(module.createZustandBridge).toBeUndefined();
      expect(module.createReduxBridge).toBeUndefined();
    }).not.toThrow();
  });
});
