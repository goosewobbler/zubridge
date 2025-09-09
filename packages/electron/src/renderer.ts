/**
 * Renderer-safe entry point for @zubridge/electron
 * This excludes Node.js-specific functionality like debug logging
 */

export type * from '@zubridge/types';
// Re-export core renderer functionality
export { createHandlers, createUseStore, useDispatch } from './index.js';
export {
  canDispatchAction,
  getAffectedStateKeys,
  registerActionMapping,
  registerActionMappings,
  validateActionDispatch,
} from './renderer/actionValidator.js';
// Re-export validation functions (these don't use Node.js APIs)
export {
  getWindowSubscriptions,
  isSubscribedToKey,
  stateKeyExists,
  validateStateAccess,
  validateStateAccessWithExistence,
} from './renderer/subscriptionValidator.js';

// Re-export environment utility (uses dynamic import for app)
export { isDev } from './utils/environment.js';
