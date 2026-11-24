import { describe, expect, it } from 'vitest';
import { QueueOverflowError } from '../../src/types/errors.js';

describe('QueueOverflowError', () => {
  it('exposes the queue size and limit', () => {
    const error = new QueueOverflowError(12, 10);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('QueueOverflowError');
    expect(error.queueSize).toBe(12);
    expect(error.maxSize).toBe(10);
    expect(error.message).toBe('Action queue overflow: 12 actions pending, maximum allowed is 10');
  });
});
