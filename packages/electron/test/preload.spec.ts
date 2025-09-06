import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies for preload tests
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('../src/renderer/rendererThunkProcessor.js', () => ({
  RendererThunkProcessor: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    setStateProvider: vi.fn(),
  })),
}));

vi.mock('../src/utils/globalErrorHandlers.js', () => ({
  setupRendererErrorHandlers: vi.fn(),
}));

vi.mock('../src/utils/preloadOptions.js', () => ({
  getPreloadOptions: vi.fn(() => ({
    actionCompletionTimeoutMs: 30000,
    maxQueueSize: 100,
  })),
}));

describe('Preload Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export preloadBridge function', async () => {
    const { preloadBridge } = await import('../src/preload.js');
    expect(typeof preloadBridge).toBe('function');
  });

  it('should create preload bridge with handlers', async () => {
    const { preloadBridge } = await import('../src/preload.js');

    // Mock the global objects that preload.ts expects
    (global as typeof globalThis).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as Window & typeof globalThis;
    (global as typeof globalThis).document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as Document;
    (global as typeof globalThis).process = { platform: 'darwin' } as NodeJS.Process;

    const result = preloadBridge();

    expect(result).toHaveProperty('handlers');
    expect(result).toHaveProperty('initialized');
    expect(result.handlers).toHaveProperty('subscribe');
    expect(result.handlers).toHaveProperty('getState');
    expect(result.handlers).toHaveProperty('dispatch');
  });

  it('should export legacy preloadZustandBridge alias', async () => {
    const { preloadZustandBridge } = await import('../src/preload.js');
    expect(typeof preloadZustandBridge).toBe('function');
  });
});
