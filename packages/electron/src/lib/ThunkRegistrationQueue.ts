import { debug } from '@zubridge/core';
import { ThunkLockState, getThunkLockManager, ThunkLockEvent } from './ThunkLockManager.js';
import type { ThunkManager } from './ThunkManager.js';

// Type for queued thunk registration
export interface QueuedThunkRegistration {
  thunkId: string;
  windowId: number;
  parentId?: string;
  thunkType: 'main' | 'renderer';
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
  private thunkRegistrationQueue: QueuedThunkRegistration[] = [];
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
    thunkId: string,
    windowId: number,
    parentId: string | undefined,
    thunkType: 'main' | 'renderer',
    mainThunkCallback?: () => Promise<any>,
    rendererCallback?: () => void,
  ): Promise<any> {
    debug('queue', `[THUNK-QUEUE] Queuing thunk registration: id=${thunkId}, windowId=${windowId}, type=${thunkType}`);
    return new Promise((resolve, reject) => {
      const reg: QueuedThunkRegistration = {
        thunkId,
        windowId,
        parentId,
        thunkType,
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
    debug(
      'queue',
      `[THUNK-QUEUE] Processing thunk registration: id=${reg.thunkId}, windowId=${reg.windowId}, type=${reg.thunkType}`,
    );
    try {
      debug('queue', `[THUNK-QUEUE] Attempting to acquire lock for thunk ${reg.thunkId} from window ${reg.windowId}`);
      const lockAcquired = thunkLockManager.tryAcquireLock(reg.thunkId, reg.windowId);
      if (!lockAcquired) {
        debug('queue', `[THUNK-QUEUE] Lock acquisition failed for thunk ${reg.thunkId}, re-queueing`);
        this.thunkRegistrationQueue.unshift(reg);
        this.processingThunkRegistration = false;
        return;
      }
      debug('queue', `[THUNK-QUEUE] Lock acquired for thunk ${reg.thunkId}`);
      const handle = this.thunkManager.registerThunkWithId(reg.thunkId, reg.parentId);
      handle.setSourceWindowId(reg.windowId);
      if (reg.thunkType === 'main' && reg.mainThunkCallback) {
        reg.mainThunkCallback().then(reg.resolve).catch(reg.reject);
      } else if (reg.thunkType === 'renderer' && reg.rendererCallback) {
        reg.rendererCallback();
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
