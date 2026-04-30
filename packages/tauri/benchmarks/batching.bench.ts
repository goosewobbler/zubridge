import type { Action } from '@zubridge/types';
import { bench, describe } from 'vitest';
import { ActionBatcher } from '../src/batching/ActionBatcher.js';
import type { BatchAckPayload, BatchPayload } from '../src/batching/types.js';
import { getBatchingConfig } from '../src/utils/preloadOptions.js';

let actionCounter = 0;
const createTestAction = (type: string): Action => ({
  type,
  __id: `bench-${type}-${actionCounter++}`,
});

const createMockSendBatch = () => {
  let callCount = 0;
  const fn = async (payload: BatchPayload): Promise<BatchAckPayload> => {
    callCount++;
    return {
      batchId: payload.batchId,
      results: payload.actions.map((a) => ({ actionId: a.id, success: true })),
    };
  };
  fn.callCount = () => callCount;
  fn.reset = () => {
    callCount = 0;
  };
  return fn;
};

describe('IPC call reduction', () => {
  const mockSendBatch = createMockSendBatch();

  bench('baseline: 50 individual IPC calls', async () => {
    for (let i = 0; i < 50; i++) {
      await mockSendBatch({
        batchId: `baseline-${i}`,
        actions: [{ action: createTestAction(`BASELINE_${i}`), id: `b-${i}` }],
      });
    }
  });

  bench('batched: 50 actions via ActionBatcher', async () => {
    const sendBatch = createMockSendBatch();
    const batcher = new ActionBatcher(getBatchingConfig(), sendBatch);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          batcher.enqueue(createTestAction(`BATCHED_${i}`), () => resolve(), reject, 50);
        }),
      );
    }

    await batcher.flush();
    await Promise.all(promises);
    batcher.destroy();
  });
});

describe('batcher throughput', () => {
  bench('enqueue + flush 10 actions', async () => {
    const sendBatch = createMockSendBatch();
    const batcher = new ActionBatcher(getBatchingConfig(), sendBatch);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          batcher.enqueue(createTestAction(`ACTION_${i}`), () => resolve(), reject, 50);
        }),
      );
    }

    await batcher.flush();
    await Promise.all(promises);
    batcher.destroy();
  });

  bench('enqueue + flush 100 actions', async () => {
    const sendBatch = createMockSendBatch();
    const batcher = new ActionBatcher(getBatchingConfig(), sendBatch);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          batcher.enqueue(createTestAction(`ACTION_${i}`), () => resolve(), reject, 50);
        }),
      );
    }

    await batcher.flush();
    await Promise.all(promises);
    batcher.destroy();
  });
});

describe('priority flush overhead', () => {
  bench('normal priority (queued)', async () => {
    const sendBatch = createMockSendBatch();
    const batcher = new ActionBatcher(getBatchingConfig(), sendBatch);

    const promise = new Promise<void>((resolve, reject) => {
      batcher.enqueue(createTestAction('NORMAL'), () => resolve(), reject, 50);
    });

    await batcher.flush();
    await promise;
    batcher.destroy();
  });

  bench('high priority (immediate flush)', async () => {
    const sendBatch = createMockSendBatch();
    const batcher = new ActionBatcher(getBatchingConfig(), sendBatch);

    const promise = new Promise<void>((resolve, reject) => {
      batcher.enqueue(createTestAction('HIGH'), () => resolve(), reject, 100);
    });

    await promise;
    batcher.destroy();
  });
});
