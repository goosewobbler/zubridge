import { debug } from '@zubridge/core';
import type { Action, StateManager, AnyState } from '@zubridge/types';
import { thunkManager } from './initThunkManager.js';

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

    // Set thunk context if this action is from a thunk
    const isThunkAction = !!(action as any).__thunkParentId;
    const thunkId = (action as any).__thunkParentId;

    if (isThunkAction) {
      debug('executor', `Setting thunk context for action ${action.type} (thunk: ${thunkId})`);
      thunkManager.setCurrentThunkAction(thunkId);
    }

    try {
      // Process action through state manager
      debug('executor', `Calling stateManager.processAction for ${action.type}`);
      const result = this.stateManager.processAction(action);
      debug(
        'executor',
        `stateManager.processAction returned for ${action.type}, result type: ${typeof result}`,
      );

      // Check if the result contains an error property
      if (result && typeof result === 'object' && result.error) {
        debug('executor:error', `Action ${action.type} returned error in result: ${result.error}`);
        throw result.error;
      }

      // Handle async results
      if (result && typeof result === 'object' && result.completion) {
        debug('executor', `Waiting for async action ${action.type} to complete`);
        try {
          const completionResult = await result.completion;
          debug('executor', `Async action ${action.type} completed successfully`);
          return completionResult;
        } catch (error) {
          debug('executor:error', `Error in async action ${action.type}: ${error}`);
          throw error;
        }
      }

      debug('executor', `Action ${action.type} executed successfully`);
      return result;
    } catch (error) {
      debug('executor:error', `Error executing action ${action.type}: ${error}`);
      debug(
        'executor:error',
        `Error details: ${error instanceof Error ? error.message : String(error)}`,
      );
      debug(
        'executor:error',
        `Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`,
      );
      throw error;
    } finally {
      // Clear thunk context after action processing
      if (isThunkAction) {
        debug('executor', `Clearing thunk context for action ${action.type}`);
        thunkManager.setCurrentThunkAction(undefined);
      }
    }
  }
}
