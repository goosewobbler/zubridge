import { describe, expect, it } from 'vitest';
import { deepGet } from '../../src/utils/deepGet.js';

describe('deepGet', () => {
  const obj = { a: { b: { c: 42 } }, list: [10, 20], zero: 0, nothing: null };

  it('reads a dotted path', () => {
    expect(deepGet(obj, 'a.b.c')).toBe(42);
  });

  it('reads an array path', () => {
    expect(deepGet(obj, ['a', 'b'])).toEqual({ c: 42 });
  });

  it('reads into arrays by index', () => {
    expect(deepGet(obj, 'list.1')).toBe(20);
  });

  it('returns falsy values that exist', () => {
    expect(deepGet(obj, 'zero', 'default')).toBe(0);
  });

  it('returns the default for missing paths', () => {
    expect(deepGet(obj, 'a.x.y', 'default')).toBe('default');
  });

  it('returns the default when traversing through null', () => {
    expect(deepGet(obj, 'nothing.deeper', 'default')).toBe('default');
  });

  it('returns undefined when no default is given', () => {
    expect(deepGet(obj, 'missing')).toBeUndefined();
  });
});
