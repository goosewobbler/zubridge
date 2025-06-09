import { debug } from '@zubridge/core';
import { ThunkLockState, getThunkLockManager, ThunkLockEvent } from './ThunkLockManager.js';
import type { ThunkManager } from './ThunkManager.js';
import type { Thunk } from './Thunk.js';

// Type for queued thunk registration
export interface QueuedThunk {
  thunk: Thunk;
  mainThunkCallback?: () => Promise<any>;
  rendererCallback?: () => void;
  resolve: (result: any) => void;
  reject: (err: any) => void;
}

export enum IpcChannel {
  REGISTER_THUNK = '__zubridge_register_thunk',
  REGISTER_THUNK_ACK = '__zubridge_register_thunk_ack',
}

export class ThunkRegistrationQueue {
  private thunkRegistrationQueue: QueuedThunk[] = [];
  private processingThunkRegistration = false;
  private thunkManager: ThunkManager;

  constructor(thunkManager: ThunkManager) {
    this.thunkManager = thunkManager;
    // Subscribe to lock release events
    const thunkLockManager = getThunkLockManager();
    thunkLockManager.on(ThunkLockEvent.LOCK_RELEASED, () => {
      debug('queue', '[THUNK-QUEUE] Received LOCK_RELEASED event, processing next registration');
      this.processNextThunkRegistration();
    });
  }

  public registerThunk(
    thunk: Thunk,
    mainThunkCallback?: () => Promise<any>,
    rendererCallback?: () => void,
  ): Promise<any> {
    debug(
      'queue',
      `[THUNK-QUEUE] Queuing thunk registration: id=${thunk.id}, windowId=${thunk.sourceWindowId}, type=${thunk.type}, bypassThunkLock=${thunk.bypassThunkLock}`,
    );
    return new Promise((resolve, reject) => {
      const reg: QueuedThunk = {
        thunk,
        mainThunkCallback,
        rendererCallback,
        resolve,
        reject,
      };
      this.thunkRegistrationQueue.push(reg);
      debug('queue', `[THUNK-QUEUE] Registration queue length: ${this.thunkRegistrationQueue.length}`);
      debug(
        'queue',
        `[THUNK-QUEUE] Current queue: ${this.thunkRegistrationQueue.map((q) => `${q.thunk.id}:${q.thunk.bypassThunkLock}`).join(', ')}`,
      );
      this.processNextThunkRegistration();
    });
  }

  public processNextThunkRegistration() {
    if (this.processingThunkRegistration) {
      debug('queue', '[THUNK-QUEUE] Already processing a thunk registration, skipping');
      return;
    }
    if (this.thunkRegistrationQueue.length === 0) {
      debug('queue', '[THUNK-QUEUE] No thunk registrations to process');
      return;
    }
    const thunkLockManager = getThunkLockManager();
    const nextThunk = this.thunkRegistrationQueue[0]?.thunk;
    debug(
      'queue',
      `[THUNK-QUEUE] Checking lock: state=${thunkLockManager.getState()}, nextThunkId=${nextThunk?.id}, bypassThunkLock=${nextThunk?.bypassThunkLock}`,
    );
    if (thunkLockManager.getState() !== ThunkLockState.IDLE && !nextThunk?.bypassThunkLock) {
      debug('queue', '[THUNK-QUEUE] Lock is not idle, cannot process next registration');
      return;
    }
    if (thunkLockManager.getState() !== ThunkLockState.IDLE && nextThunk?.bypassThunkLock) {
      debug('queue', `[THUNK-QUEUE] BYPASS: Processing bypass thunk ${nextThunk.id} while lock is not idle`);
    }
    this.processingThunkRegistration = true;
    const reg = this.thunkRegistrationQueue.shift()!;
    const { thunk, mainThunkCallback, rendererCallback } = reg;
    debug(
      'queue',
      `[THUNK-QUEUE] Processing thunk registration: id=${thunk.id}, windowId=${thunk.sourceWindowId}, type=${thunk.type}, bypassThunkLock=${thunk.bypassThunkLock}`,
    );
    try {
      debug(
        'queue',
        `[THUNK-QUEUE] Attempting to acquire lock for thunk ${thunk.id} from window ${thunk.sourceWindowId} (bypassThunkLock=${thunk.bypassThunkLock})`,
      );
      const lockAcquired = thunkLockManager.acquire(thunk.id, thunk.keys, thunk.bypassThunkLock);
      debug('queue', `[THUNK-QUEUE] Lock acquired result for thunk ${thunk.id}: ${lockAcquired}`);
      if (!lockAcquired) {
        debug('queue', `[THUNK-QUEUE] Lock acquisition failed for thunk ${thunk.id}, re-queueing`);
        this.thunkRegistrationQueue.unshift(reg);
        this.processingThunkRegistration = false;
        return;
      }
      debug('queue', `[THUNK-QUEUE] Lock acquired for thunk ${thunk.id}`);
      const handle = this.thunkManager.registerThunk(thunk);
      handle.setSourceWindowId(thunk.sourceWindowId);
      debug('queue', `[THUNK-QUEUE] Thunk ${thunk.id} registered, invoking callback`);
      if (thunk.type === 'main' && mainThunkCallback) {
        mainThunkCallback().then(reg.resolve).catch(reg.reject);
      } else if (thunk.type === 'renderer' && rendererCallback) {
        rendererCallback();
        reg.resolve(undefined);
      } else {
        reg.resolve(undefined);
      }
    } catch (err) {
      debug('queue', `[THUNK-QUEUE] Error processing thunk registration: ${(err as Error).message}`);
      reg.reject(err);
    } finally {
      this.processingThunkRegistration = false;
      debug('queue', '[THUNK-QUEUE] Finished processing thunk registration');
      // No need for setTimeout-based polling; rely on event-driven processing
    }
  }
}
