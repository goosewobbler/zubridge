import type { UnlistenFn } from '@tauri-apps/api/event';
import type { DispatchFunc } from '@zubridge/types';
import { afterAll, beforeAll, bench, describe } from 'vitest';
import {
  type BackendOptions,
  cleanupZubridge,
  initializeBridge,
  TauriCommands,
  useZubridgeDispatch,
} from '../src/index.js';

/**
 * End-to-end dispatch latency benchmarks against a fully-mocked Tauri
 * transport. The mocks resolve invoke calls synchronously on the next
 * microtask, so the numbers measure the JS overhead of:
 *
 *   useZubridgeDispatch -> BridgeClient.dispatch -> invoke()
 *
 * (constructing the wire payload, action validation, and the renderer
 * thunk processor's bookkeeping). Network / IPC cost is excluded by
 * design — those are environment-dependent and would dominate any signal.
 *
 * The bridge is initialised once in beforeAll and the dispatch closure is
 * captured at module scope, so each bench iteration measures only the
 * dispatch path itself — not module resolution or initialisation cost.
 */

let stateUpdateListener: ((event: { payload: unknown }) => void) | null = null;
const mockBackendState: Record<string, unknown> = { counter: 0 };

const mockInvoke = async (cmd: string, args?: unknown): Promise<unknown> => {
  switch (cmd) {
    case TauriCommands.GET_INITIAL_STATE:
      return mockBackendState;
    case TauriCommands.GET_STATE:
      return { value: mockBackendState };
    case TauriCommands.DISPATCH_ACTION: {
      const id = (args as { args: { action: { id?: string } } }).args.action.id ?? 'a';
      return { action_id: id };
    }
    case TauriCommands.BATCH_DISPATCH: {
      const batchId = (args as { args: { batch_id: string } }).args.batch_id;
      return { batch_id: batchId, acked_action_ids: [] };
    }
    case TauriCommands.REGISTER_THUNK:
    case TauriCommands.COMPLETE_THUNK:
      return { thunk_id: (args as { args: { thunk_id: string } }).args.thunk_id };
    case TauriCommands.STATE_UPDATE_ACK:
      return undefined;
    case TauriCommands.SUBSCRIBE:
      return { keys: (args as { args: { keys: string[] } }).args.keys };
    case TauriCommands.UNSUBSCRIBE:
    case TauriCommands.GET_WINDOW_SUBSCRIPTIONS:
      return { keys: [] };
    default:
      throw new Error(`[bench mock] Unknown command: ${cmd}`);
  }
};

const mockListen = async <E = unknown>(
  event: string,
  handler: (event: E) => void,
): Promise<UnlistenFn> => {
  if (event === 'zubridge://state-update') {
    stateUpdateListener = handler as (event: { payload: unknown }) => void;
  }
  return () => {};
};

const baseOptions: BackendOptions = {
  invoke: mockInvoke as unknown as BackendOptions['invoke'],
  listen: mockListen,
};

// Captured once in beforeAll so bench iterations don't pay setup cost.
let dispatch: DispatchFunc<Record<string, unknown>>;

beforeAll(async () => {
  await initializeBridge(baseOptions);
  dispatch = useZubridgeDispatch();
});

afterAll(async () => {
  await cleanupZubridge();
  stateUpdateListener = null;
});

// Touch the listener reference so dead-code elimination keeps it. The
// state-update path is exercised in the deltaBenchmark suite; this file
// focuses on the dispatch latency dimension.
void stateUpdateListener;

describe('dispatch latency', () => {
  bench('string action', async () => {
    await dispatch('INCREMENT');
  });

  bench('object action with payload', async () => {
    await dispatch({ type: 'SET_COUNTER', payload: 42 });
  });

  bench('object action with deeply-nested payload', async () => {
    await dispatch({
      type: 'SET_TREE',
      payload: {
        a: { b: { c: { d: { e: { value: 1, items: [1, 2, 3] } } } } },
      },
    });
  });
});

describe('dispatch latency - high-volume sequence', () => {
  bench('10 sequential string dispatches', async () => {
    for (let i = 0; i < 10; i++) {
      await dispatch(`ACTION_${i}`);
    }
  });

  bench('50 sequential string dispatches', async () => {
    for (let i = 0; i < 50; i++) {
      await dispatch(`ACTION_${i}`);
    }
  });
});
