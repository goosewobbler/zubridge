import { debug } from '@zubridge/core';
import type { Handler } from '@zubridge/types';

/**
 * Helper function to find a case-insensitive match in an object
 */
export function findCaseInsensitiveMatch<T>(
  obj: Record<string, T>,
  key: string,
): [string, T] | undefined {
  // Try exact match first
  if (key in obj) {
    debug('store', `Found exact match for handler key: ${key}`);
    return [key, obj[key]];
  }

  // Try case-insensitive match
  const keyLower = key.toLowerCase();
  const matchingKey = Object.keys(obj).find((k) => k.toLowerCase() === keyLower);

  if (matchingKey) {
    debug('store', `Found case-insensitive match for handler key '${key}': ${matchingKey}`);
    return [matchingKey, obj[matchingKey]];
  }

  debug('store', `No match found for handler key: ${key}`);
  return undefined;
}

/**
 * Helper function to find a handler by nested path
 * Example: "counter.increment" -> obj.counter.increment
 */
export function findNestedHandler<T>(obj: Record<string, unknown>, path: string): T | undefined {
  try {
    debug('store', `Resolving nested handler for path: ${path}`);

    const parts = path.split('.');
    let current = obj;

    // Navigate through each part of the path
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Case-insensitive comparison for each level
      const keys = Object.keys(current);
      const matchingKey = keys.find((k) => k.toLowerCase() === part.toLowerCase());

      if (matchingKey === undefined) {
        debug('store', `Could not find part '${part}' in path '${path}'`);
        return undefined;
      }

      current = current[matchingKey];
      debug('store', `Resolved part '${part}' to '${matchingKey}', continuing resolution`);
    }

    if (typeof current === 'function') {
      debug('store', `Successfully resolved handler for path: ${path}`);
      return current as T;
    }

    debug('store', `Found value for path ${path}, but it's not a function`);
    return undefined;
  } catch (error) {
    debug('store', 'Error resolving nested handler:', error);
    return undefined;
  }
}

/**
 * Resolves a handler function from provided handlers using action type
 * This handles both direct matches and nested path resolution
 */
export function resolveHandler(
  handlers: Record<string, Handler | unknown>,
  actionType: string,
): Handler | undefined {
  debug('store', `Resolving handler for action type: ${actionType}`);

  // Try direct match with handlers
  const handlerMatch = findCaseInsensitiveMatch(handlers, actionType);
  if (handlerMatch && typeof handlerMatch[1] === 'function') {
    debug('store', `Found direct handler match for action type: ${actionType}`);
    return handlerMatch[1] as Handler;
  }

  // Try nested path resolution in handlers
  debug('store', `No direct handler match, trying nested path resolution for: ${actionType}`);
  return findNestedHandler<Handler>(handlers, actionType);
}
