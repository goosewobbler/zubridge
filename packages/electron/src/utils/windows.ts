import type { WebContents } from 'electron';
import type { WebContentsWrapper, WrapperOrWebContents } from '@zubridge/types';

/**
 * Type guard to check if an object is an Electron WebContents
 */
export const isWebContents = (wrapperOrWebContents: WrapperOrWebContents): wrapperOrWebContents is WebContents => {
  return wrapperOrWebContents && typeof wrapperOrWebContents === 'object' && 'id' in wrapperOrWebContents;
};

/**
 * Type guard to check if an object is a WebContentsWrapper
 */
export const isWrapper = (wrapperOrWebContents: WrapperOrWebContents): wrapperOrWebContents is WebContentsWrapper => {
  return wrapperOrWebContents && typeof wrapperOrWebContents === 'object' && 'webContents' in wrapperOrWebContents;
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
  if (isWebContents(wrapperOrWebContents)) {
    return wrapperOrWebContents;
  }

  if (isWrapper(wrapperOrWebContents)) {
    const webContents = wrapperOrWebContents.webContents;
    return webContents;
  }

  return undefined;
};

/**
 * Check if a WebContents is destroyed
 */
export const isDestroyed = (webContents: WebContents): boolean => {
  try {
    if (typeof webContents.isDestroyed === 'function') {
      const destroyed = webContents.isDestroyed();
      return destroyed;
    }
    return false;
  } catch (error) {
    return true;
  }
};

/**
 * Safely send a message to a WebContents
 */
export const safelySendToWindow = (webContents: WebContents, channel: string, data: unknown): boolean => {
  try {
    if (!webContents || isDestroyed(webContents)) {
      return false;
    }

    // Type check for WebContents API
    const hasWebContentsAPI = typeof webContents.send === 'function';
    if (!hasWebContentsAPI) {
      return false;
    }

    // Check if isLoading is a function before calling it
    const isLoading = typeof webContents.isLoading === 'function' ? webContents.isLoading() : false;

    if (isLoading) {
      webContents.once('did-finish-load', () => {
        try {
          if (!webContents.isDestroyed()) {
            webContents.send(channel, data);
          }
        } catch (e) {}
      });
      return true;
    }

    webContents.send(channel, data);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Set up cleanup when WebContents is destroyed
 */
export const setupDestroyListener = (webContents: WebContents, cleanup: () => void): void => {
  try {
    if (typeof webContents.once === 'function') {
      webContents.once('destroyed', () => {
        cleanup();
      });
    }
  } catch (e) {}
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
  // WeakMap for the primary storage - won't prevent garbage collection
  const webContentsTracker = new WeakMap<WebContents, { id: number }>();

  // Set to track active subscription IDs (not object references)
  const activeIds = new Set<number>();

  // Strong reference map of WebContents by ID - we need this to retrieve active WebContents
  // This will be maintained alongside the WeakMap
  const webContentsById = new Map<number, WebContents>();

  return {
    track: (webContents: WebContents): boolean => {
      if (!webContents) {
        return false;
      }

      if (isDestroyed(webContents)) {
        return false;
      }

      const id = webContents.id;

      webContentsTracker.set(webContents, { id });
      activeIds.add(id);
      webContentsById.set(id, webContents);

      // Set up the destroyed listener for cleanup
      setupDestroyListener(webContents, () => {
        activeIds.delete(id);
        webContentsById.delete(id);
      });

      return true;
    },

    untrack: (webContents: WebContents): void => {
      if (!webContents) {
        return;
      }

      const id = webContents.id;

      // Explicitly delete from all tracking structures
      webContentsTracker.delete(webContents);
      activeIds.delete(id);
      webContentsById.delete(id);
    },

    untrackById: (id: number): void => {
      activeIds.delete(id);
      const webContents = webContentsById.get(id);
      if (webContents) {
        webContentsTracker.delete(webContents);
      }
      webContentsById.delete(id);
    },

    isTracked: (webContents: WebContents): boolean => {
      if (!webContents) {
        return false;
      }

      return webContents && webContentsTracker.has(webContents) && activeIds.has(webContents.id);
    },

    hasId: (id: number): boolean => {
      return activeIds.has(id);
    },

    getActiveIds: (): number[] => {
      const ids = [...activeIds];
      return ids;
    },

    getActiveWebContents: (): WebContents[] => {
      const result: WebContents[] = [];

      // Filter out any destroyed WebContents that might still be in our map
      for (const [id, webContents] of webContentsById.entries()) {
        if (!isDestroyed(webContents)) {
          result.push(webContents);
        } else {
          activeIds.delete(id);
          webContentsById.delete(id);
        }
      }
      return result;
    },

    cleanup: (): void => {
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
    return [];
  }

  const result: WebContents[] = [];

  for (const wrapper of wrappers) {
    const webContents = getWebContents(wrapper);
    if (webContents && !isDestroyed(webContents)) {
      result.push(webContents);
    }
  }

  return result;
};
