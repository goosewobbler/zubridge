/**
 * Debug logging utility for Zubridge packages
 */
import debug, { Debugger } from 'weald';
import wdioLogger from '@wdio/logger';

const logger = wdioLogger('zubridge');

// Create debug instances for different areas
const debuggers = {
  core: debug('zubridge:core'),
  ipc: debug('zubridge:ipc'),
  store: debug('zubridge:store'),
  adapters: debug('zubridge:adapters'),
  windows: debug('zubridge:windows'),
  serialization: debug('zubridge:serialization'),
};

// Cache for dynamically created debuggers
const dynamicDebuggers = new Map<string, Debugger>();

/**
 * Get or create a debugger for the specified area
 */
function getDebugger(area: string): Debugger {
  if (area in debuggers) {
    return debuggers[area as keyof typeof debuggers];
  }

  if (!dynamicDebuggers.has(area)) {
    dynamicDebuggers.set(area, debug(`zubridge:${area}`));
  }

  return dynamicDebuggers.get(area)!;
}

/**
 * Log a debug message
 */
export function debugLog(area: string, ...args: any[]): void {
  const debugInstance = getDebugger(area);
  debugInstance(args);

  if (area.endsWith(':error')) {
    logger.error(area, ...args);
  } else if (area.endsWith(':warn')) {
    logger.warn(area, ...args);
  } else if (area.endsWith(':info')) {
    logger.info(area, ...args);
  } else {
    logger.debug(area, ...args);
  }
}

// Re-export the debug function for convenience
export { debugLog as debug };
