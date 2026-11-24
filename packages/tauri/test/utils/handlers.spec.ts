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

  it('prefers an exact match', () => {
    expect(findCaseInsensitiveMatch(obj, 'Increment')).toEqual(['Increment', 1]);
  });

  it('falls back to a case-insensitive match', () => {
    expect(findCaseInsensitiveMatch(obj, 'INCREMENT')).toEqual(['Increment', 1]);
  });

  it('returns undefined when nothing matches', () => {
    expect(findCaseInsensitiveMatch(obj, 'missing')).toBeUndefined();
  });
});

describe('findNestedHandler', () => {
  const increment = () => undefined;
  const handlers = { counter: { increment }, value: 5 };

  it('resolves a nested path case-insensitively', () => {
    expect(findNestedHandler(handlers, 'COUNTER.Increment')).toBe(increment);
  });

  it('returns undefined when a path segment is missing', () => {
    expect(findNestedHandler(handlers, 'counter.decrement')).toBeUndefined();
  });

  it('returns undefined when the target is not a function', () => {
    expect(findNestedHandler(handlers, 'value')).toBeUndefined();
  });

  it('returns undefined instead of throwing on a null segment', () => {
    expect(findNestedHandler({ a: null }, 'a.b')).toBeUndefined();
  });
});

describe('resolveHandler', () => {
  it('resolves a direct handler', () => {
    const inc = vi.fn();
    const handlers = { INCREMENT: inc };

    expect(resolveHandler(handlers, 'increment')).toBe(inc);
  });

  it('resolves a nested handler', () => {
    const inc = vi.fn();
    const handlers = { counter: { increment: inc } };

    expect(resolveHandler(handlers, 'counter.increment')).toBe(inc);
  });

  it('returns undefined for unknown action types', () => {
    expect(resolveHandler({}, 'nope')).toBeUndefined();
  });

  it('caches resolutions per handlers object', () => {
    const handlers: Record<string, Handler | unknown> = {};
    const first = vi.fn();
    handlers.thing = first;
    expect(resolveHandler(handlers, 'thing')).toBe(first);

    handlers.thing = vi.fn();
    expect(resolveHandler(handlers, 'thing')).toBe(first);
  });

  it('does not share the cache between handlers objects', () => {
    const a = vi.fn();
    const b = vi.fn();

    expect(resolveHandler({ thing: a }, 'thing')).toBe(a);
    expect(resolveHandler({ thing: b }, 'thing')).toBe(b);
  });

  it('expires cached entries after the TTL', () => {
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

  it('keeps resolving correctly when the cache exceeds its size limit', () => {
    const handlers: Record<string, unknown> = {};
    for (let i = 0; i < 1100; i++) {
      handlers[`action${i}`] = vi.fn();
    }

    for (let i = 0; i < 1100; i++) {
      expect(resolveHandler(handlers, `action${i}`)).toBe(handlers[`action${i}`]);
    }
  });
});
