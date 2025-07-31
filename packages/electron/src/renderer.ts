/**
 * Renderer-safe entry point for @zubridge/electron
 * This excludes Node.js-specific functionality like debug logging
 */

// Re-export core renderer functionality
export { createHandlers, createUseStore, useDispatch } from './index.js';
export type * from '@zubridge/types';

// Re-export validation functions (these don't use Node.js APIs)
export {
  validateStateAccess,
  validateStateAccessWithExistence,
  stateKeyExists,
  isSubscribedToKey,
  getWindowSubscriptions,
} from './renderer/subscriptionValidator.js';

export {
  registerActionMapping,
  registerActionMappings,
  getAffectedStateKeys,
  canDispatchAction,
  validateActionDispatch,
} from './renderer/actionValidator.js';

// Re-export environment utility (uses dynamic import for app)
export { isDev } from './utils/environment.js';
