import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDev } from '../../src/utils/environment';

// Create a mock object that we can modify during tests
const mockElectron = {
  app: {
    isPackaged: false as boolean,
  },
};

// Create a renderer mock for renderer process tests
const rendererMock = {
  app: undefined, // We want app to be undefined in the renderer process
};

// Mock electron app module - must use async vi.mock for dynamic imports
vi.mock('electron', async () => {
  return mockElectron;
});

describe('environment utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Reset electron mock to default value
    mockElectron.app.isPackaged = false;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return true in development mode when app is not packaged', async () => {
    const result = await isDev();
    expect(result).toBe(true);
  });

  it('should return true when NODE_ENV is development', async () => {
    // Set app to packaged for this test
    mockElectron.app.isPackaged = true;

    process.env.NODE_ENV = 'development';

    const result = await isDev();
    expect(result).toBe(true);
  });

  it('should return true when ELECTRON_IS_DEV is set to 1', async () => {
    // Set app to packaged for this test
    mockElectron.app.isPackaged = true;

    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_DEV = '1';

    const result = await isDev();
    expect(result).toBe(true);
  });

  it('should return false in production mode', async () => {
    // Set app to packaged for this test
    mockElectron.app.isPackaged = true;

    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_DEV = '0';
    delete process.env.VITE_DEV_SERVER_URL;

    const result = await isDev();
    expect(result).toBe(false);
  });

  it('should handle renderer process case where app is undefined', async () => {
    // Override the global mock
    vi.doMock('electron', async () => {
      return rendererMock;
    });

    process.env.NODE_ENV = 'development';

    // Need to re-import to get fresh module with new mock
    const { isDev: freshIsDev } = await import('../../src/utils/environment');
    const result = await freshIsDev();
    expect(result).toBe(true);
  });

  it('should use Vite-specific check in renderer process', async () => {
    // Override the global mock
    vi.doMock('electron', async () => {
      return rendererMock;
    });

    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_DEV = '0';

    // Need to re-import to get fresh module with new mock
    const { isDev: freshIsDev } = await import('../../src/utils/environment');

    // Test without VITE_DEV_SERVER_URL (falls back to true)
    delete process.env.VITE_DEV_SERVER_URL;
    const result1 = await freshIsDev();
    expect(result1).toBe(true);

    // Test with VITE_DEV_SERVER_URL (should be false in production)
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:3000';
    const result2 = await freshIsDev();
    expect(result2).toBe(false);
  });
});
