import { debug } from '@zubridge/core';
import type { AnyState } from '@zubridge/types';

/**
 * Type guard to check if a value is a Promise
 */
export const isPromise = (value: unknown): value is Promise<unknown> =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as { then: unknown }).then === 'function';

/**
 * Options for state serialization
 */
interface SerializationOptions {
  /** Maximum depth to traverse (prevents infinite recursion) */
  maxDepth?: number;
  /** Custom replacer function for values */
  replacer?: (key: string, value: unknown) => unknown;
  /** Specific keys to include (if provided, only these keys will be processed) */
  filterKeys?: string[];
  /** Whether to include non-enumerable properties */
  includeNonEnumerable?: boolean;
}

/**
 * Removes functions and non-serializable objects from a state object
 * to prevent IPC serialization errors when sending between processes
 *
 * This implementation prevents memory leaks and stack overflow by:
 * - Using WeakSet to detect circular references
 * - Limiting recursion depth
 * - Handling special object types (Date, RegExp, etc.)
 * - Providing clear error boundaries
 *
 * @param state The state object to sanitize
 * @param options Serialization options
 * @returns A new state object with functions and non-serializable parts removed
 */
export const sanitizeState = (
  state: AnyState,
  options?: SerializationOptions,
): Record<string, unknown> => {
  const opts: SerializationOptions = options || {};

  const { maxDepth = 10, replacer, filterKeys, includeNonEnumerable = false } = opts;

  // Use WeakSet to detect circular references
  const seen = new WeakSet<object>();

  function serialize(value: unknown, currentDepth = 0, currentKey = ''): unknown {
    // Prevent infinite recursion
    if (currentDepth > maxDepth) {
      return `[Max Depth Exceeded: ${currentKey}]`;
    }

    // Handle primitives
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      return value;
    }

    if (typeof value === 'bigint') {
      return `${value.toString()}n`;
    }

    if (typeof value === 'symbol') {
      return `[Symbol: ${value.toString()}]`;
    }

    if (typeof value === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }

    if (typeof value !== 'object') {
      return `[Unknown Type: ${typeof value}]`;
    }

    // Handle circular references
    if (seen.has(value as object)) {
      return '[Circular Reference]';
    }

    // Mark as seen
    seen.add(value as object);

    try {
      // Handle special object types
      if (value instanceof Date) {
        return value.toISOString();
      }

      if (value instanceof RegExp) {
        return `[RegExp: ${value.toString()}]`;
      }

      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (value instanceof Map) {
        const entries: Array<[unknown, unknown]> = [];
        for (const [k, v] of value.entries()) {
          entries.push([
            serialize(k, currentDepth + 1, `${currentKey}[Map Key]`),
            serialize(v, currentDepth + 1, `${currentKey}[Map Value]`),
          ]);
        }
        return { __type: 'Map', entries };
      }

      if (value instanceof Set) {
        const values: unknown[] = [];
        for (const v of value.values()) {
          values.push(serialize(v, currentDepth + 1, `${currentKey}[Set Value]`));
        }
        return { __type: 'Set', values };
      }

      if (ArrayBuffer.isView(value)) {
        return `[${value.constructor.name}: ${value.byteLength} bytes]`;
      }

      if (value instanceof ArrayBuffer) {
        return `[ArrayBuffer: ${value.byteLength} bytes]`;
      }

      // Handle arrays
      if (Array.isArray(value)) {
        return value.map((item, index) =>
          serialize(item, currentDepth + 1, `${currentKey}[${index}]`),
        );
      }

      // Handle plain objects
      const result: Record<string, unknown> = {};
      const obj = value as Record<string, unknown>;

      // Get keys to process
      let keysToProcess: string[];
      if (filterKeys) {
        keysToProcess = filterKeys.filter((key) => key in obj);
      } else {
        keysToProcess = includeNonEnumerable ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
      }

      for (const key of keysToProcess) {
        try {
          const propValue = obj[key];
          const keyPath = currentKey ? `${currentKey}.${key}` : key;

          // Apply custom replacer if provided
          const valueToSerialize = replacer ? replacer(key, propValue) : propValue;

          if (valueToSerialize !== undefined) {
            result[key] = serialize(valueToSerialize, currentDepth + 1, keyPath);
          }
        } catch (error: unknown) {
          result[key] =
            `[Error accessing property: ${error instanceof Error ? error.message : String(error)}]`;
        }
      }

      return result;
    } catch (error: unknown) {
      return `[Serialization Error: ${error instanceof Error ? error.message : String(error)}]`;
    } finally {
      // Remove from seen set to allow the same object at different paths
      seen.delete(value as object);
    }
  }

  try {
    if (!state || typeof state !== 'object') {
      return state as Record<string, unknown>;
    }

    return serialize(state) as Record<string, unknown>;
  } catch (error: unknown) {
    debug('serialization:error', 'Critical serialization error:', error);
    return {
      __serializationError: true,
      message: error instanceof Error ? error.message : String(error),
      originalType: typeof state,
    };
  }
};
