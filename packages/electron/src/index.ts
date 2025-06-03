import type { AnyState, DispatchFunc, DispatchOptions, Handlers } from '@zubridge/types';
import { useStore, type StoreApi } from 'zustand';
import { createStore as createZustandStore } from 'zustand/vanilla';
import type { Action, Thunk } from '@zubridge/types';
import { getThunkProcessor } from './renderer/rendererThunkProcessor.js';

// Re-export the types (avoiding ambiguity)
export type { AnyState, DispatchFunc, DispatchOptions, Handlers, Action, Thunk } from '@zubridge/types';

// Export core functionality
export { preloadBridge } from './preload.js';
export * from './main.js';

// Export environment utilities
export * from './utils/environment';

// Export the validation utilities to be used by applications
export {
  validateStateAccess,
  validateStateAccessWithExistence,
  stateKeyExists,
  isSubscribedToKey,
  getWindowSubscriptions,
} from './renderer/subscriptionValidator.js';

// Export action validation utilities
export {
  registerActionMapping,
  registerActionMappings,
  getAffectedStateKeys,
  canDispatchAction,
  validateActionDispatch,
} from './renderer/actionValidator.js';
