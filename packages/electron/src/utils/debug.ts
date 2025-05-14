/**
 * Debug logging utility for the electron package
 *
 * This provides a way to centrally control debug logging throughout the package.
 * This implementation uses the 'debug' package.
 */
import debug from 'weald';

// Define type for the areas object with index signature
interface DebugAreas {
  core: debug.Debugger;
  ipc: debug.Debugger;
  store: debug.Debugger;
  adapters: debug.Debugger;
  windows: debug.Debugger;
  serialization: debug.Debugger;
  [key: string]: debug.Debugger;
}

// Create debug namespaces for different areas
const areas: DebugAreas = {
  core: debug('zubridge:core'),
  ipc: debug('zubridge:ipc'),
  store: debug('zubridge:store'),
  adapters: debug('zubridge:adapters'),
  windows: debug('zubridge:windows'),
  serialization: debug('zubridge:serialization'),
};

// Allow dynamic creation of debug areas
const createAreaDebugger = (area: string): debug.Debugger => {
  // Create a new debug instance for this area if it doesn't exist
  if (!(area in areas)) {
    areas[area] = debug(`zubridge:${area}`);
  }
  return areas[area];
};

/**
 * Log a debug message using the debug package
 *
 * @param area The area to log to
 * @param args The arguments to log
 */
export function debugLog(area: string, ...args: any[]): void {
  const debugInstance = createAreaDebugger(area);
  // Use Function.prototype.apply properly
  Function.prototype.apply.call(debugInstance, null, args);
}

/**
 * Enable debugging for specific areas or all areas
 *
 * @param areas Optional list of areas to enable, or true to enable all, defaults to all
 */
export function enableDebug(areas?: string[] | boolean): void {
  const namespaces = [];

  if (typeof areas === 'boolean' && areas === true) {
    // Enable all
    namespaces.push('zubridge:*');
  } else if (Array.isArray(areas)) {
    // Enable specific areas
    for (const area of areas) {
      namespaces.push(`zubridge:${area}`);
    }
  } else {
    // Enable all by default
    namespaces.push('zubridge:*');
  }

  // Set DEBUG environment variable for Node.js
  const namespaceString = namespaces.join(',');
  if (typeof process !== 'undefined') {
    process.env.DEBUG = process.env.DEBUG ? `${process.env.DEBUG},${namespaceString}` : namespaceString;
  }

  // Also use the debug.enable API for browser compatibility
  debug.enable(namespaceString);
}

/**
 * Disable debugging for specific areas or all areas
 *
 * @param areas Optional list of areas to disable, or none to disable all
 */
export function disableDebug(areas?: string[]): void {
  if (!areas) {
    // Disable all zubridge debugging
    if (typeof process !== 'undefined' && process.env.DEBUG) {
      // Remove all zubridge:* namespaces from DEBUG, but keep others
      const currentDebug = process.env.DEBUG.split(',')
        .filter((namespace) => !namespace.startsWith('zubridge:'))
        .join(',');

      process.env.DEBUG = currentDebug;
    }

    // Use debug.disable for consistency, though it doesn't support selective disabling
    debug.disable();
    // Re-enable any namespaces that might be in process.env.DEBUG
    if (typeof process !== 'undefined' && process.env.DEBUG) {
      debug.enable(process.env.DEBUG);
    }
  } else {
    // We can't selectively disable with debug package API
    // Instead, we'll need to enable all except the ones we want to disable
    if (typeof process !== 'undefined' && process.env.DEBUG) {
      const disableSet = new Set(areas.map((area) => `zubridge:${area}`));

      // Get all currently enabled namespaces
      const currentNamespaces = process.env.DEBUG.split(',');

      // Filter out the ones we want to disable
      const newNamespaces = currentNamespaces.filter((namespace) => !disableSet.has(namespace)).join(',');

      // Update DEBUG env var
      process.env.DEBUG = newNamespaces;

      // Re-enable the updated namespaces
      if (newNamespaces) {
        debug.enable(newNamespaces);
      }
    }
  }
}

/**
 * Check if debugging is enabled for a specific area
 *
 * @param area The area to check
 * @returns True if debugging is enabled for this area
 */
export function isDebugEnabled(area: string): boolean {
  const debugInstance = createAreaDebugger(area);
  return debugInstance.enabled;
}

// Determine if we should auto-enable debugging based on environment variable
if (typeof process !== 'undefined' && process.env.ZUBRIDGE_DEBUG === 'true') {
  enableDebug(true);
}

// Export as both named exports and a default object
export const debugUtils = {
  log: debugLog,
  enable: enableDebug,
  disable: disableDebug,
  isEnabled: isDebugEnabled,
};

// Re-export the debug function for convenience
export { debugLog as debug };
