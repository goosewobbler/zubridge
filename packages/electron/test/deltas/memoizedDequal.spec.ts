import { describe, expect, it } from 'vitest';
import { createMemoizedDequal } from '../../src/deltas/memoizedDequal.js';

describe('createMemoizedDequal', () => {
  it('deep-compares each pair of objects once', () => {
    const isEqual = createMemoizedDequal();
    let reads = 0;
    const prev = {
      get nested() {
        reads++;
        return { a: 1 };
      },
    };
    const next = { nested: { a: 1 } };

    expect(isEqual(prev, next)).toBe(true);
    const firstReads = reads;
    expect(isEqual(prev, next)).toBe(true);
    expect(firstReads).toBeGreaterThan(0);
    expect(reads).toBe(firstReads);
  });

  it('keeps separate results for different pairs', () => {
    const isEqual = createMemoizedDequal();
    const prev = { a: 1 };

    expect(isEqual(prev, { a: 1 })).toBe(true);
    expect(isEqual(prev, { a: 2 })).toBe(false);
  });
});
