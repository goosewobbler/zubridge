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
      `[THUNK-QUEUE] Queuing thunk registration: id=${thunk.id}, windowId=${thunk.sourceWindowId}, type=${thunk.type}`,
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
    if (thunkLockManager.getState() !== ThunkLockState.IDLE) {
      debug('queue', '[THUNK-QUEUE] Lock is not idle, cannot process next registration');
      return;
    }
    this.processingThunkRegistration = true;
    const reg = this.thunkRegistrationQueue.shift()!;
    const { thunk, mainThunkCallback, rendererCallback } = reg;
    debug(
      'queue',
      `[THUNK-QUEUE] Processing thunk registration: id=${thunk.id}, windowId=${thunk.sourceWindowId}, type=${thunk.type}`,
    );
    try {
      debug(
        'queue',
        `[THUNK-QUEUE] Attempting to acquire lock for thunk ${thunk.id} from window ${thunk.sourceWindowId}`,
      );
      const lockAcquired = thunkLockManager.acquire(thunk.id, thunk.keys, thunk.force);
      if (!lockAcquired) {
        debug('queue', `[THUNK-QUEUE] Lock acquisition failed for thunk ${thunk.id}, re-queueing`);
        this.thunkRegistrationQueue.unshift(reg);
        this.processingThunkRegistration = false;
        return;
      }
      debug('queue', `[THUNK-QUEUE] Lock acquired for thunk ${thunk.id}`);
      const handle = this.thunkManager.registerThunk(thunk);
      handle.setSourceWindowId(thunk.sourceWindowId);
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
      // No need for setTimeout-based polling; rely on event-driven processing
    }
  }
}
