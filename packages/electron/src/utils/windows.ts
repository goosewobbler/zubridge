import type { WebContents } from 'electron';
import type { WebContentsWrapper, WrapperOrWebContents } from '@zubridge/types';
import { debug } from '@zubridge/core';

/**
 * Type guard to check if an object is an Electron WebContents
 */
export const isWebContents = (wrapperOrWebContents: WrapperOrWebContents): wrapperOrWebContents is WebContents => {
  const result = wrapperOrWebContents && typeof wrapperOrWebContents === 'object' && 'id' in wrapperOrWebContents;
  if (result) {
    debug('windows', `isWebContents: TRUE for id ${(wrapperOrWebContents as WebContents).id}`);
  } else {
    debug('windows', 'isWebContents: FALSE', wrapperOrWebContents);
  }
  return result;
};

/**
 * Type guard to check if an object is a WebContentsWrapper
 */
export const isWrapper = (wrapperOrWebContents: WrapperOrWebContents): wrapperOrWebContents is WebContentsWrapper => {
  const result =
    wrapperOrWebContents && typeof wrapperOrWebContents === 'object' && 'webContents' in wrapperOrWebContents;

  if (result) {
    debug('windows', `isWrapper: TRUE for id ${(wrapperOrWebContents as WebContentsWrapper).webContents?.id}`);
  } else {
    debug('windows', 'isWrapper: FALSE', wrapperOrWebContents);
  }
  return result;
};

/**
 * Get the WebContents object from either a WebContentsWrapper or WebContents
 */
export const getWebContents = (wrapperOrWebContents: WrapperOrWebContents): WebContents | undefined => {
  // Create a more readable description of the input for logging
  let description = 'Invalid input';

  if (wrapperOrWebContents && typeof wrapperOrWebContents === 'object') {
    if ('id' in wrapperOrWebContents) {
      description = `WebContents ID: ${wrapperOrWebContents.id}`;
    } else if ('webContents' in wrapperOrWebContents) {
      description = `Wrapper with WebContents ID: ${wrapperOrWebContents.webContents?.id}`;
    } else {
      description = 'Unknown object type';
    }
  }

  debug('windows', `getWebContents called with: ${description}`);

  if (isWebContents(wrapperOrWebContents)) {
    debug('windows', `getWebContents: Returning direct WebContents with ID: ${wrapperOrWebContents.id}`);
    return wrapperOrWebContents;
  }

  if (isWrapper(wrapperOrWebContents)) {
    const webContents = wrapperOrWebContents.webContents;
    debug('windows', `getWebContents: Extracting from wrapper, ID: ${webContents?.id || 'undefined'}`);
    return webContents;
  }

  debug('windows', 'getWebContents: Could not extract WebContents, returning undefined');
  return undefined;
};

/**
 * Check if a WebContents is destroyed
 */
export const isDestroyed = (webContents: WebContents): boolean => {
  try {
    if (typeof webContents.isDestroyed === 'function') {
      const destroyed = webContents.isDestroyed();
      debug('windows', `isDestroyed check for WebContents ID ${webContents.id}: ${destroyed}`);
      return destroyed;
    }
    debug('windows', `isDestroyed: WebContents ID ${webContents?.id} has no isDestroyed function`);
    return false;
  } catch (error) {
    debug('windows', `isDestroyed: Exception while checking ID ${webContents?.id}`, error);
    return true;
  }
};

/**
 * Safely send a message to a WebContents
 */
export const safelySendToWindow = (webContents: WebContents, channel: string, data: unknown): boolean => {
  try {
    debug(
      'windows',
      `safelySendToWindow: Attempting to send to WebContents ID ${webContents?.id}, channel: ${channel}`,
    );

    if (!webContents || isDestroyed(webContents)) {
      debug('windows', `safelySendToWindow: WebContents is undefined or destroyed, aborting send`);
      return false;
    }

    // Type check for WebContents API
    const hasWebContentsAPI = typeof webContents.send === 'function';
    if (!hasWebContentsAPI) {
      debug('windows', `safelySendToWindow: WebContents ID ${webContents.id} missing 'send' function`);
      return false;
    }

    // Check if isLoading is a function before calling it
    const isLoading = typeof webContents.isLoading === 'function' ? webContents.isLoading() : false;
    debug('windows', `safelySendToWindow: WebContents ID ${webContents.id} isLoading: ${isLoading}`);

    if (isLoading) {
      debug('windows', `safelySendToWindow: WebContents ID ${webContents.id} is loading, queueing message for later`);
      webContents.once('did-finish-load', () => {
        try {
          if (!webContents.isDestroyed()) {
            debug('windows', `safelySendToWindow: Now sending delayed message to WebContents ID ${webContents.id}`);
            webContents.send(channel, data);
          } else {
            debug('windows', `safelySendToWindow: WebContents ID ${webContents.id} was destroyed before load finished`);
          }
        } catch (e) {
          debug('windows', `safelySendToWindow: Error sending delayed message to WebContents ID ${webContents.id}`, e);
        }
      });
      return true;
    }

    debug('windows', `safelySendToWindow: Sending message immediately to WebContents ID ${webContents.id}`);
    webContents.send(channel, data);
    return true;
  } catch (error) {
    debug('windows', `safelySendToWindow: Exception while sending to WebContents ID ${webContents?.id}`, error);
    return false;
  }
};

/**
 * Set up cleanup when WebContents is destroyed
 */
export const setupDestroyListener = (webContents: WebContents, cleanup: () => void): void => {
  try {
    debug('windows', `setupDestroyListener: Setting up cleanup for WebContents ID ${webContents?.id}`);
    if (typeof webContents.once === 'function') {
      webContents.once('destroyed', () => {
        debug('windows', `WebContents ID ${webContents.id} destroyed, running cleanup`);
        cleanup();
      });
    } else {
      debug('windows', `setupDestroyListener: WebContents ID ${webContents.id} missing 'once' function`);
    }
  } catch (e) {
    debug('windows', `setupDestroyListener: Exception for WebContents ID ${webContents?.id}`, e);
  }
};

/**
 * Creates a tracker for WebContents objects using WeakMap for automatic garbage collection
 * and a Set to keep track of active IDs
 */
export interface WebContentsTracker {
  track(webContents: WebContents): boolean;
  untrack(webContents: WebContents): void;
  untrackById(id: number): void;
  isTracked(webContents: WebContents): boolean;
  hasId(id: number): boolean;
  getActiveIds(): number[];
  getActiveWebContents(): WebContents[];
  cleanup(): void;
}

/**
 * Creates a WebContents tracker that uses WeakMap for automatic garbage collection
 * but maintains a set of active IDs for tracking purposes
 */
export const createWebContentsTracker = (): WebContentsTracker => {
  debug('windows', 'Creating new WebContentsTracker');

  // WeakMap for the primary storage - won't prevent garbage collection
  const webContentsTracker = new WeakMap<WebContents, { id: number }>();

  // Set to track active subscription IDs (not object references)
  const activeIds = new Set<number>();

  // Strong reference map of WebContents by ID - we need this to retrieve active WebContents
  // This will be maintained alongside the WeakMap
  const webContentsById = new Map<number, WebContents>();

  const logTrackerState = () => {
    debug(
      'windows',
      `WebContentsTracker state: ${activeIds.size} active IDs, ${webContentsById.size} tracked WebContents`,
    );
    debug('windows', `Active IDs: ${[...activeIds].join(', ')}`);
  };

  return {
    track: (webContents: WebContents): boolean => {
      if (!webContents) {
        debug('windows', 'track: Called with undefined WebContents');
        return false;
      }

      if (isDestroyed(webContents)) {
        debug('windows', `track: WebContents ID ${webContents.id} is already destroyed`);
        return false;
      }

      const id = webContents.id;
      debug('windows', `track: Adding WebContents ID ${id} to tracker`);

      webContentsTracker.set(webContents, { id });
      activeIds.add(id);
      webContentsById.set(id, webContents);

      // Set up the destroyed listener for cleanup
      setupDestroyListener(webContents, () => {
        debug('windows', `track: Cleanup handler for WebContents ID ${id} triggered`);
        activeIds.delete(id);
        webContentsById.delete(id);
      });

      logTrackerState();
      return true;
    },

    untrack: (webContents: WebContents): void => {
      if (!webContents) {
        debug('windows', 'untrack: Called with undefined WebContents');
        return;
      }

      const id = webContents.id;
      debug('windows', `untrack: Removing WebContents ID ${id} from tracker`);

      // Explicitly delete from all tracking structures
      webContentsTracker.delete(webContents);
      activeIds.delete(id);
      webContentsById.delete(id);

      logTrackerState();
    },

    untrackById: (id: number): void => {
      debug('windows', `untrackById: Removing ID ${id} from tracker`);

      activeIds.delete(id);
      const webContents = webContentsById.get(id);
      if (webContents) {
        debug('windows', `untrackById: Found and removing WebContents for ID ${id}`);
        webContentsTracker.delete(webContents);
      }
      webContentsById.delete(id);

      logTrackerState();
    },

    isTracked: (webContents: WebContents): boolean => {
      if (!webContents) {
        debug('windows', 'isTracked: Called with undefined WebContents');
        return false;
      }

      const tracked = webContents && webContentsTracker.has(webContents) && activeIds.has(webContents.id);

      debug('windows', `isTracked: WebContents ID ${webContents.id} tracked: ${tracked}`);
      return tracked;
    },

    hasId: (id: number): boolean => {
      const has = activeIds.has(id);
      debug('windows', `hasId: ID ${id} in tracker: ${has}`);
      return has;
    },

    getActiveIds: (): number[] => {
      const ids = [...activeIds];
      debug('windows', `getActiveIds: Returning ${ids.length} active IDs: ${ids.join(', ')}`);
      return ids;
    },

    getActiveWebContents: (): WebContents[] => {
      debug('windows', 'getActiveWebContents: Collecting active WebContents');
      const result: WebContents[] = [];

      // Filter out any destroyed WebContents that might still be in our map
      for (const [id, webContents] of webContentsById.entries()) {
        if (!isDestroyed(webContents)) {
          debug('windows', `getActiveWebContents: Adding active WebContents ID ${id}`);
          result.push(webContents);
        } else {
          // Clean up any destroyed WebContents we find
          debug('windows', `getActiveWebContents: Found destroyed WebContents ID ${id}, cleaning up`);
          activeIds.delete(id);
          webContentsById.delete(id);
        }
      }

      debug('windows', `getActiveWebContents: Returning ${result.length} active WebContents`);
      return result;
    },

    cleanup: (): void => {
      debug('windows', `cleanup: Clearing all tracked WebContents (${activeIds.size} IDs)`);
      activeIds.clear();
      webContentsById.clear();
    },
  };
};

/**
 * Prepare WebContents objects from an array of wrappers or WebContents
 */
export const prepareWebContents = (wrappers?: WrapperOrWebContents[]): WebContents[] => {
  if (!wrappers || !Array.isArray(wrappers)) {
    debug('windows', 'prepareWebContents: No wrappers provided or invalid input, returning empty array');
    return [];
  }

  debug('windows', `prepareWebContents: Processing ${wrappers.length} wrappers/WebContents`);
  const result: WebContents[] = [];

  for (const wrapper of wrappers) {
    const webContents = getWebContents(wrapper);
    if (webContents && !isDestroyed(webContents)) {
      debug('windows', `prepareWebContents: Adding WebContents ID ${webContents.id} to result`);
      result.push(webContents);
    } else {
      debug('windows', 'prepareWebContents: Skipping undefined or destroyed WebContents');
    }
  }

  debug('windows', `prepareWebContents: Returning ${result.length} valid WebContents objects`);
  return result;
};
