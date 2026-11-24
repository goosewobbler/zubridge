import type { Handler } from '@zubridge/types';
import { describe, expect, it, vi } from 'vitest';
import {
  findCaseInsensitiveMatch,
  findNestedHandler,
  resolveHandler,
} from '../../src/utils/handlers.js';

vi.mock('@zubridge/utils', () => ({ debug: vi.fn() }));

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

  it('should keep resolving correctly when the cache exceeds its size limit', () => {
    const handlers: Record<string, unknown> = {};
    for (let i = 0; i < 1100; i++) {
      handlers[`action${i}`] = vi.fn();
    }

    for (let i = 0; i < 1100; i++) {
      expect(resolveHandler(handlers, `action${i}`)).toBe(handlers[`action${i}`]);
    }
  });
});
