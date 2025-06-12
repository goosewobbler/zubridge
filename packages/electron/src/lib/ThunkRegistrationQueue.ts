import { debug } from '@zubridge/core';
import { ThunkManager, ThunkManagerEvent } from './ThunkManager.js';
import { Thunk } from './Thunk.js';

// Type for queued thunk registration
interface QueuedThunk<T = any> {
  thunk: Thunk;
  mainThunkCallback?: () => Promise<T>;
  rendererCallback?: () => void;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
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
    debug('queue', '[THUNK-QUEUE] ThunkRegistrationQueue initialized');

    // Listen for thunk completion events to process the next registration
    this.thunkManager.on(ThunkManagerEvent.ROOT_THUNK_COMPLETED, () => {
      debug('queue', `[THUNK-QUEUE] Received ROOT_THUNK_COMPLETED event, processing next registration`);
      this.processNextThunkRegistration();
    });

    // Listen for thunk started events (useful for bypass thunks)
    this.thunkManager.on(ThunkManagerEvent.THUNK_STARTED, () => {
      debug('queue', `[THUNK-QUEUE] Received THUNK_STARTED event, processing next registration for bypass thunks`);
      this.processNextThunkRegistration();
    });
  }

  public registerThunk<T = any>(
    thunk: Thunk,
    mainThunkCallback?: () => Promise<T>,
    rendererCallback?: () => void,
  ): Promise<T> {
    debug(
      'queue',
      `[THUNK-QUEUE] Registering thunk ${thunk.id} from ${thunk.source}${thunk.bypassThunkLock ? ' (bypass)' : ''}`,
    );

    return new Promise<T>((resolve, reject) => {
      this.thunkRegistrationQueue.push({
        thunk,
        mainThunkCallback,
        rendererCallback,
        resolve,
        reject,
      });

      this.processNextThunkRegistration();
    });
  }

  public processNextThunkRegistration() {
    debug('queue-debug', `[DEBUG] processNextThunkRegistration called`);

    if (this.processingThunkRegistration) {
      debug('queue-debug', `[DEBUG] Already processing a thunk registration, not proceeding`);
      return;
    }

    if (this.thunkRegistrationQueue.length === 0) {
      debug('queue-debug', `[DEBUG] No thunk registrations in the queue, not proceeding`);
      return;
    }

    const nextThunk = this.thunkRegistrationQueue[0]?.thunk;

    // Special handling for bypass thunks - they proceed regardless of the current state
    if (nextThunk?.bypassThunkLock) {
      this.processingThunkRegistration = true;
      const registration = this.thunkRegistrationQueue.shift();
      if (registration) {
        this.processThunkRegistration(registration);
      } else {
        this.processingThunkRegistration = false;
      }
      return;
    }

    // Check if there are no active thunks (scheduler is idle)
    const status = this.thunkManager.getActiveThunksSummary();
    const canRegister = status.thunks.length === 0;

    if (canRegister) {
      debug('queue', `[THUNK-QUEUE] Scheduler allows thunk registration, processing next thunk registration`);
      this.processingThunkRegistration = true;
      const registration = this.thunkRegistrationQueue.shift();
      if (registration) {
        this.processThunkRegistration(registration);
      } else {
        this.processingThunkRegistration = false;
      }
    } else {
      debug('queue', `[THUNK-QUEUE] Scheduler state doesn't allow registration, waiting for state change`);
    }
  }

  private handleCompletion<T>(registration: QueuedThunk<T>, result: T) {
    // Complete the promise
    registration.resolve(result);

    // Process the next thunk in queue
    this.processingThunkRegistration = false;
    this.processNextThunkRegistration();
  }

  private handleError(registration: QueuedThunk<any>, error: any) {
    // Fail the promise
    registration.reject(error);

    // Process the next thunk in queue
    this.processingThunkRegistration = false;
    this.processNextThunkRegistration();
  }

  private processThunkRegistration<T>(registration: QueuedThunk<T>) {
    const { thunk, mainThunkCallback, rendererCallback } = registration;

    debug(
      'queue',
      `[THUNK-QUEUE] Processing thunk registration: id=${thunk.id}, windowId=${thunk.sourceWindowId}, type=${thunk.source}, bypassThunkLock=${thunk.bypassThunkLock}`,
    );

    try {
      // Check if there are no active thunks (scheduler is idle) or if this is a bypass thunk
      const status = this.thunkManager.getActiveThunksSummary();
      const canRegister = status.thunks.length === 0 || thunk.bypassThunkLock;

      if (!canRegister) {
        debug('queue', `[THUNK-QUEUE] Thunk ${thunk.id} cannot register, queueing for later`);
        this.thunkRegistrationQueue.unshift(registration);
        this.processingThunkRegistration = false;
        return;
      }

      // Register with the ThunkManager
      debug(
        'thunk',
        `Registering thunk: id=${thunk.id}, parentId=${thunk.parentId}, bypassThunkLock=${thunk.bypassThunkLock}`,
      );

      // Register the thunk with the manager
      this.thunkManager.registerThunk(thunk.id, thunk, {
        parentId: thunk.parentId,
        windowId: thunk.sourceWindowId,
        bypassThunkLock: thunk.bypassThunkLock,
      });

      // Execute the thunk based on its source type
      if (thunk.source === 'main' && mainThunkCallback) {
        debug('queue-debug', `[DEBUG] Executing main thunk callback for thunk ${thunk.id} directly`);

        // Mark the thunk as executing (starts it in the scheduler)
        this.thunkManager.markThunkExecuting(thunk.id, thunk.sourceWindowId);

        // Run the callback directly
        Promise.resolve().then(async () => {
          try {
            debug('queue-debug', `[DEBUG] Main thunk ${thunk.id} starting execution`);
            const result = await mainThunkCallback();
            debug('queue-debug', `[DEBUG] Main thunk ${thunk.id} completed successfully`);

            // Mark the thunk as completing
            this.thunkManager.markThunkCompleting(thunk.id, result);

            // Handle completion
            this.handleCompletion(registration, result);
          } catch (error) {
            debug('queue-debug', `[DEBUG] Main thunk ${thunk.id} failed with error: ${error}`);

            // Mark the thunk as failed
            this.thunkManager.markThunkFailed(thunk.id, error as Error);

            // Handle error
            this.handleError(registration, error);
          }
        });
      } else if (thunk.source === 'renderer' && rendererCallback) {
        debug('queue-debug', `[DEBUG] Executing renderer callback for thunk ${thunk.id}`);

        // Mark the thunk as executing (starts it in the scheduler)
        this.thunkManager.markThunkExecuting(thunk.id, thunk.sourceWindowId);

        // Run the callback directly
        Promise.resolve().then(async () => {
          try {
            debug('queue-debug', `[DEBUG] Renderer thunk ${thunk.id} starting execution`);
            await rendererCallback();
            debug('queue-debug', `[DEBUG] Renderer thunk ${thunk.id} completed successfully`);

            // Mark the thunk as completing
            this.thunkManager.markThunkCompleting(thunk.id);

            // Handle completion with null result (renderer callbacks don't return anything)
            this.handleCompletion(registration, null as unknown as T);
          } catch (error) {
            debug('queue-debug', `[DEBUG] Renderer thunk ${thunk.id} failed with error: ${error}`);

            // Mark the thunk as failed
            this.thunkManager.markThunkFailed(thunk.id, error as Error);

            // Handle error
            this.handleError(registration, error);
          }
        });
      } else {
        debug('queue', `[THUNK-QUEUE] No callback for thunk ${thunk.id}, skipping execution`);

        // Mark thunk as started and then immediately completed
        this.thunkManager.markThunkExecuting(thunk.id, thunk.sourceWindowId);
        this.thunkManager.markThunkCompleting(thunk.id);

        // Handle completion with undefined result
        this.handleCompletion(registration, null as unknown as T);
      }
    } catch (error) {
      debug('queue', `[THUNK-QUEUE] Error processing thunk ${thunk.id}: ${error}`);

      // Handle error
      this.handleError(registration, error);
    }
  }
}
