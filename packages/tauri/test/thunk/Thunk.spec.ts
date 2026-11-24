import { describe, expect, it, vi } from 'vitest';
import { Thunk, ThunkState } from '../../src/thunk/Thunk.js';

vi.mock('@zubridge/utils', () => ({ debug: vi.fn() }));

const makeThunk = (overrides: Partial<ConstructorParameters<typeof Thunk>[0]> = {}) =>
  new Thunk({ sourceWindowId: 1, source: 'renderer', ...overrides });

describe('Thunk', () => {
  it('starts pending with the provided options', () => {
    const thunk = makeThunk({
      id: 'abc',
      parentId: 'parent',
      keys: ['a'],
      immediate: true,
      bypassAccessControl: true,
      contextId: 'ctx',
    });

    expect(thunk.id).toBe('abc');
    expect(thunk.parentId).toBe('parent');
    expect(thunk.source).toBe('renderer');
    expect(thunk.sourceWindowId).toBe(1);
    expect(thunk.keys).toEqual(['a']);
    expect(thunk.immediate).toBe(true);
    expect(thunk.bypassAccessControl).toBe(true);
    expect(thunk.contextId).toBe('ctx');
    expect(thunk.state).toBe(ThunkState.PENDING);
    expect(thunk.isComplete()).toBe(false);
  });

  it('generates unique ids when none is provided', () => {
    expect(makeThunk().id).not.toBe(makeThunk().id);
  });

  it('transitions through its lifecycle states', () => {
    const thunk = makeThunk();

    thunk.activate();
    expect(thunk.state).toBe(ThunkState.EXECUTING);
    expect(thunk.isComplete()).toBe(false);

    thunk.complete();
    expect(thunk.state).toBe(ThunkState.COMPLETED);
    expect(thunk.isComplete()).toBe(true);
  });

  it('treats a failed thunk as complete', () => {
    const thunk = makeThunk();

    thunk.fail();

    expect(thunk.state).toBe(ThunkState.FAILED);
    expect(thunk.isComplete()).toBe(true);
  });

  it('tracks child thunk ids without duplicates', () => {
    const thunk = makeThunk();

    thunk.addChild('c1');
    thunk.addChild('c2');
    thunk.addChild('c1');

    expect(thunk.getChildren()).toEqual(['c1', 'c2']);
  });

  it('allows updating the source window and context id', () => {
    const thunk = makeThunk();

    thunk.sourceWindowId = 7;
    thunk.contextId = 'next';

    expect(thunk.sourceWindowId).toBe(7);
    expect(thunk.contextId).toBe('next');
  });
});
