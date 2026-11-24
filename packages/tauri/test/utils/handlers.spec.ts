import type { Handler } from '@zubridge/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findCaseInsensitiveMatch,
  findNestedHandler,
  resolveHandler,
} from '../../src/utils/handlers.js';

const { debug } = vi.hoisted(() => ({ debug: vi.fn() }));
vi.mock('@zubridge/utils', () => ({ debug }));

describe('findCaseInsensitiveMatch', () => {
  const obj = { Increment: 1, other: 2 };

  it('should prefer an exact match', () => {
    expect(findCaseInsensitiveMatch(obj, 'Increment')).toEqual(['Increment', 1]);
  });

  it('should fall back to a case-insensitive match', () => {
    expect(findCaseInsensitiveMatch(obj, 'INCREMENT')).toEqual(['Increment', 1]);
  });

  it('should return undefined when nothing matches', () => {
    expect(findCaseInsensitiveMatch(obj, 'missing')).toBeUndefined();
  });
});

describe('findNestedHandler', () => {
  const increment = () => undefined;
  const handlers = { counter: { increment }, value: 5 };

  it('should resolve a nested path case-insensitively', () => {
    expect(findNestedHandler(handlers, 'COUNTER.Increment')).toBe(increment);
  });

  it('should return undefined when a path segment is missing', () => {
    expect(findNestedHandler(handlers, 'counter.decrement')).toBeUndefined();
  });

  it('should return undefined when the target is not a function', () => {
    expect(findNestedHandler(handlers, 'value')).toBeUndefined();
  });

  it('should return undefined instead of throwing on a null segment', () => {
    expect(findNestedHandler({ a: null }, 'a.b')).toBeUndefined();
  });
});

describe('resolveHandler', () => {
  it('should resolve a direct handler', () => {
    const inc = vi.fn();
    const handlers = { INCREMENT: inc };

    expect(resolveHandler(handlers, 'increment')).toBe(inc);
  });

  it('should resolve a nested handler', () => {
    const inc = vi.fn();
    const handlers = { counter: { increment: inc } };

    expect(resolveHandler(handlers, 'counter.increment')).toBe(inc);
  });

  it('should return undefined for unknown action types', () => {
    expect(resolveHandler({}, 'nope')).toBeUndefined();
  });

  it('should cache resolutions per handlers object', () => {
    const handlers: Record<string, Handler | unknown> = {};
    const first = vi.fn();
    handlers.thing = first;
    expect(resolveHandler(handlers, 'thing')).toBe(first);

    handlers.thing = vi.fn();
    expect(resolveHandler(handlers, 'thing')).toBe(first);
  });

  it('should not share the cache between handlers objects', () => {
    const a = vi.fn();
    const b = vi.fn();

    expect(resolveHandler({ thing: a }, 'thing')).toBe(a);
    expect(resolveHandler({ thing: b }, 'thing')).toBe(b);
  });

  it('should expire cached entries after the TTL', () => {
    vi.useFakeTimers();
    try {
      const handlers: Record<string, unknown> = { thing: vi.fn() };
      const first = resolveHandler(handlers, 'thing');
      const replacement = vi.fn();
      handlers.thing = replacement;

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(resolveHandler(handlers, 'thing')).toBe(replacement);
      expect(first).not.toBe(replacement);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('cache maintenance', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
      debug.mockClear();
    });

    it('should evict the oldest entries once the cache reaches its size limit', () => {
      const handlers: Record<string, unknown> = {};
      for (let i = 0; i <= 1000; i++) {
        handlers[`action${i}`] = vi.fn();
      }
      const original = { oldest: handlers.action0, recent: handlers.action500 };

      for (let i = 0; i <= 1000; i++) {
        resolveHandler(handlers, `action${i}`);
      }
      handlers.action0 = vi.fn();
      handlers.action500 = vi.fn();

      expect(resolveHandler(handlers, 'action0')).toBe(handlers.action0);
      expect(resolveHandler(handlers, 'action500')).toBe(original.recent);
      expect(debug).toHaveBeenCalledWith(
        'handlers:cache',
        'Removed 200 handler cache entries to manage size',
      );
    });

    it('should remove expired entries when the periodic cleanup runs', () => {
      vi.useFakeTimers();
      const handlers = { a: vi.fn(), b: vi.fn(), c: vi.fn() };
      resolveHandler(handlers, 'a');
      resolveHandler(handlers, 'b');

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      resolveHandler(handlers, 'c');

      expect(debug).toHaveBeenCalledWith(
        'handlers:cache',
        'Cleaned up 2 expired handler cache entries',
      );
    });

    it('should not run the periodic cleanup on most resolutions', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      resolveHandler({ a: vi.fn() }, 'a');

      expect(debug).not.toHaveBeenCalledWith(
        'handlers:cache',
        expect.stringContaining('Cleaned up'),
      );
    });
  });
});
