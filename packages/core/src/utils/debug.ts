/**
 * Debug logging utility for Zubridge packages
 * Supports optional weald and @wdio/logger dependencies that are loaded dynamically
 * Falls back to console logging in sandbox or when dependencies are unavailable
 */

type DebugFunction = (...args: unknown[]) => void;

// WDIO Logger interface
interface WDIOLogger {
  error: (namespace: string, ...args: unknown[]) => void;
  warn: (namespace: string, ...args: unknown[]) => void;
  info: (namespace: string, ...args: unknown[]) => void;
  debug: (namespace: string, ...args: unknown[]) => void;
}

// Weald debug function type
type WealdDebugFunction = (namespace: string) => DebugFunction;

// Global type extension for WDIO
declare global {
  // eslint-disable-next-line no-var
  var browser: unknown | undefined;
}

// Check if we're running in a WDIO test environment
const isWDIOTest = (): boolean => {
  if (typeof process === 'undefined') return false;

  // Check for WDIO-specific globals or environment variables
  return (
    typeof globalThis.browser !== 'undefined' || // WDIO sets global.browser
    process.env.WDIO === 'true' ||
    !!process.env.WDIO_LOG_LEVEL
  );
};

// Check if DEBUG environment variable or localStorage flag is set
const isDebugEnabled = (): boolean => {
  // Check environment variable (Node.js/Electron main process)
  if (typeof process !== 'undefined' && process.env?.DEBUG) {
    const debugPattern = process.env.DEBUG;
    return debugPattern === '*' || debugPattern.includes('zubridge');
  }

  // Check localStorage (browser/renderer process)
  if (typeof localStorage !== 'undefined') {
    try {
      const debug = localStorage.getItem('debug');
      return debug === '*' || debug?.includes('zubridge') || false;
    } catch {
      return false;
    }
  }

  return false;
};

// Optional logger instances
let wdioLogger: WDIOLogger | null = null;
let wealdDebug: WealdDebugFunction | null = null;
let loggersInitialized = false;

/**
 * Attempt to load optional logging dependencies dynamically
 */
async function initializeOptionalLoggers(): Promise<void> {
  if (loggersInitialized) return;
  loggersInitialized = true;

  // Try to load WDIO logger if in test environment
  if (isWDIOTest()) {
    try {
      const wdioModule = await import('@wdio/logger');
      const loggerFactory = wdioModule.default || wdioModule;
      // Call the factory function to create a logger instance
      wdioLogger = (loggerFactory as (name: string) => WDIOLogger)('zubridge');
    } catch {
      // Not available - will use console fallback
    }
  }

  // Try to load weald for non-WDIO environments
  if (!isWDIOTest()) {
    try {
      const wealdModule = await import('weald');
      wealdDebug = (wealdModule.default || wealdModule) as WealdDebugFunction;
    } catch {
      // Not available - will use console fallback
    }
  }
}

// Start initializing loggers immediately
initializeOptionalLoggers();

/**
 * Create a debug function for a specific namespace
 */
function createDebugger(namespace: string): DebugFunction {
  return (...args: unknown[]) => {
    if (!isDebugEnabled()) return;

    // Use WDIO logger if available
    if (wdioLogger) {
      if (namespace.endsWith(':error')) {
        wdioLogger.error(namespace, ...args);
      } else if (namespace.endsWith(':warn')) {
        wdioLogger.warn(namespace, ...args);
      } else if (namespace.endsWith(':info')) {
        wdioLogger.info(namespace, ...args);
      } else {
        wdioLogger.debug(namespace, ...args);
      }
      return;
    }

    // Use weald if available
    if (wealdDebug) {
      const debugInstance = wealdDebug(namespace);
      debugInstance(...args);
      return;
    }

    // Fallback to console
    console.log(`[${namespace}]`, ...args);
  };
}

// Create debug instances for different areas
const debuggers = {
  core: createDebugger('zubridge:core'),
  ipc: createDebugger('zubridge:ipc'),
  store: createDebugger('zubridge:store'),
  adapters: createDebugger('zubridge:adapters'),
  windows: createDebugger('zubridge:windows'),
  serialization: createDebugger('zubridge:serialization'),
};

// Cache for dynamically created debuggers
const dynamicDebuggers = new Map<string, DebugFunction>();

/**
 * Get or create a debugger for the specified area
 */
function getDebugger(area: string): DebugFunction {
  if (area in debuggers) {
    return debuggers[area as keyof typeof debuggers];
  }

  if (!dynamicDebuggers.has(area)) {
    dynamicDebuggers.set(area, createDebugger(`zubridge:${area}`));
  }

  const debugFn = dynamicDebuggers.get(area);
  if (!debugFn) throw new Error(`Failed to create debugger for area: ${area}`);
  return debugFn;
}

/**
 * Log a debug message
 */
export function debugLog(area: string, ...args: unknown[]): void {
  const debugInstance = getDebugger(area);
  debugInstance(...args);
}

// Re-export the debug function for convenience
export { debugLog as debug };
