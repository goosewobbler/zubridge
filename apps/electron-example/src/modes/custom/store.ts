import { EventEmitter } from 'events';
import type { StateManager, Action, AnyState } from '@zubridge/types';
import { getInitialState, handlers } from './features/index.js';

/**
 * Custom store using EventEmitter that directly implements StateManager
 * This demonstrates implementing a custom state manager without using Zustand or Redux
 */
class CustomStore extends EventEmitter implements StateManager<AnyState> {
  // The current state
  private state: AnyState = getInitialState();

  /**
   * Get the current state
   */
  getState = (): AnyState => {
    console.log('[Custom Mode] Getting state:', this.state);
    return { ...this.state };
  };

  /**
   * Update the state and emit change event
   */
  setState = (newState: Partial<AnyState>, replace = false): void => {
    if (replace) {
      this.state = newState as AnyState;
    } else {
      this.state = { ...this.state, ...newState };
    }
    console.log('[Custom Mode] State updated:', this.state);
    this.emit('stateChange', this.state);
  };

  /**
   * Subscribe to state changes
   */
  subscribe = (listener: (state: AnyState) => void): (() => void) => {
    console.log('[Custom Mode] Adding listener');
    this.on('stateChange', listener);
    return () => {
      console.log('[Custom Mode] Removing listener');
      this.off('stateChange', listener);
    };
  };

  /**
   * Process an action and update state
   * @param action The action to process
   */
  processAction = (action: Action): void => {
    console.log('[Custom Mode] Processing action:', action);

    // Special case for SET_STATE action from the adapter
    if (action.type === 'SET_STATE' && action.payload) {
      this.setState(action.payload as Partial<AnyState>);
      return;
    }

    // Handle different action types using the handlers from features/index.js
    const handler = handlers[action.type];

    if (handler) {
      // If the action has a payload, pass it to the handler
      const payload = typeof action === 'object' && 'payload' in action ? action.payload : undefined;

      // Call the handler with the appropriate arguments
      const newState = typeof payload !== 'undefined' ? handler(payload) : handler(this.getState());

      // Update the state with the result
      this.setState(newState);
    } else {
      console.log('[Custom Mode] Unhandled action type:', action.type);
    }
  };
}

/**
 * Gets a custom store instance
 * Returns the raw CustomStore which implements StateManager interface
 */
export function getCustomStore(): StateManager<AnyState> {
  console.log('[Custom Mode] Creating EventEmitter store');

  // Create and return a new CustomStore instance
  return new CustomStore();
}
