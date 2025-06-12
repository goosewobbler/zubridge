import { debug } from '@zubridge/core';
import type { Action, StateManager, AnyState } from '@zubridge/types';

/**
 * Responsible for executing actions through state managers
 * This separates execution concerns from scheduling concerns
 */
export class ActionExecutor<S extends AnyState = AnyState> {
  constructor(private stateManager: StateManager<S>) {
    debug('executor', 'ActionExecutor initialized');
  }

  /**
   * Execute an action directly through the state manager
   * This is the final execution step after all scheduling is done
   */
  public async executeAction(action: Action): Promise<any> {
    debug('executor', `Executing action ${action.type} (ID: ${action.__id || 'unknown'})`);

    try {
      // Process action through state manager
      const result = this.stateManager.processAction(action);

      // Handle async results
      if (result && typeof result === 'object' && result.completion) {
        debug('executor', `Waiting for async action ${action.type} to complete`);
        try {
          return await result.completion;
        } catch (error) {
          debug('executor:error', `Error in async action ${action.type}: ${error}`);
          throw error;
        }
      }

      return result;
    } catch (error) {
      debug('executor:error', `Error executing action ${action.type}: ${error}`);
      throw error;
    }
  }
}
