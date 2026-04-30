import { debug } from '@zubridge/core';
import type { Handler } from '@zubridge/types';

// Cache for handler resolutions to improve performance
// Using WeakMap keyed by handlers object for automatic cleanup when handlers change
const handlerResolutionCache = new WeakMap<
  Record<string, Handler | unknown>,
  Map<string, { handler: Handler | undefined; timestamp: number }>
>();

// Cache settings
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Prevent unbounded growth per handlers object

/**
 * Gets or creates a cache Map for a specific handlers object
 */
function getCacheForHandlers(
  handlers: Record<string, Handler | unknown>,
): Map<string, { handler: Handler | undefined; timestamp: number }> {
  let cache = handlerResolutionCache.get(handlers);
  if (!cache) {
    cache = new Map();
    handlerResolutionCache.set(handlers, cache);
  }
  return cache;
}

/**
 * Cleans up expired cache entries for a specific handlers object
 */
function cleanupExpiredCacheEntries(
  handlersCache: Map<string, { handler: Handler | undefined; timestamp: number }>,
): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, entry] of handlersCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      handlersCache.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    debug('handlers:cache', `Cleaned up ${cleanedCount} expired handler cache entries`);
  }
}

/**
 * Manages cache size to prevent memory leaks for a specific handlers object
 */
function manageCacheSize(
  handlersCache: Map<string, { handler: Handler | undefined; timestamp: number }>,
): void {
  if (handlersCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entries (first entries in Map are oldest)
    const entriesToRemove = handlersCache.size - Math.floor(MAX_CACHE_SIZE * 0.8); // Keep 80%
    let removedCount = 0;

    for (const key of handlersCache.keys()) {
      if (removedCount >= entriesToRemove) break;
      handlersCache.delete(key);
      removedCount++;
    }

    debug('handlers:cache', `Removed ${removedCount} handler cache entries to manage size`);
  }
}

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

      current = current[matchingKey] as Record<string, unknown>;
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
 * Uses WeakMap-based caching to improve performance while automatically invalidating when handlers change
 */
export function resolveHandler(
  handlers: Record<string, Handler | unknown>,
  actionType: string,
): Handler | undefined {
  debug('store', `Resolving handler for action type: ${actionType}`);

  // Get cache for this specific handlers object
  const handlersCache = getCacheForHandlers(handlers);
  const now = Date.now();

  // Check cache first
  const cachedEntry = handlersCache.get(actionType);
  if (cachedEntry && now - cachedEntry.timestamp < CACHE_TTL_MS) {
    debug('store', `Found cached handler resolution for action type: ${actionType}`);
    return cachedEntry.handler;
  }

  // Cache miss or expired - perform resolution
  debug('store', `Cache miss, performing handler resolution for action type: ${actionType}`);

  let resolvedHandler: Handler | undefined;

  // Try direct match with handlers
  const handlerMatch = findCaseInsensitiveMatch(handlers, actionType);
  if (handlerMatch && typeof handlerMatch[1] === 'function') {
    debug('store', `Found direct handler match for action type: ${actionType}`);
    resolvedHandler = handlerMatch[1] as Handler;
  } else {
    // Try nested path resolution in handlers
    debug('store', `No direct handler match, trying nested path resolution for: ${actionType}`);
    resolvedHandler = findNestedHandler<Handler>(handlers, actionType);
  }

  // Cache the result (even if undefined)
  manageCacheSize(handlersCache);
  handlersCache.set(actionType, {
    handler: resolvedHandler,
    timestamp: now,
  });

  // Periodically clean up expired entries (every 100th resolution)
  if (Math.random() < 0.01) {
    // 1% chance
    cleanupExpiredCacheEntries(handlersCache);
  }

  return resolvedHandler;
}
