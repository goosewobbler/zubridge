import { debug } from '@zubridge/core';
import type { Action, AnyState } from '@zubridge/types';
import type { SubscriptionManager } from '../../subscription/SubscriptionManager.js';
import type { CoreBridgeOptions } from '../../types/bridge.js';
import type { WebContentsTracker } from '../../utils/windows.js';

// Middleware callback functions
export interface MiddlewareCallbacks {
  trackActionDispatch?: (action: Action) => Promise<void>;
  trackActionReceived?: (action: Action) => Promise<void>;
  trackStateUpdate?: (action: Action, state: string) => Promise<void>;
  trackActionAcknowledged?: (actionId: string) => Promise<void>;
}

/**
 * Resource manager to prevent memory leaks in bridge components
 */
export class ResourceManager<State extends AnyState> {
  private subscriptionManagers = new Map<number, SubscriptionManager<State>>();
  private destroyListenerSet = new Set<number>();
  private middlewareCallbacks: MiddlewareCallbacks = {};
  private MAX_SUBSCRIPTION_MANAGERS = 1000; // Prevent unbounded growth (configurable)
  private cleanupTimer?: NodeJS.Timeout;

  private windowTracker?: WebContentsTracker;

  constructor(
    windowTracker?: WebContentsTracker,
    options?: CoreBridgeOptions['resourceManagement'],
  ) {
    this.windowTracker = windowTracker;

    // Override defaults with user options
    const cleanupEnabled = options?.enablePeriodicCleanup ?? true; // Default: enabled
    const cleanupInterval = options?.cleanupIntervalMs ?? 10 * 60 * 1000; // Default: 10 minutes (conservative)
    this.MAX_SUBSCRIPTION_MANAGERS = options?.maxSubscriptionManagers ?? 1000;

    // Enable periodic cleanup only if we have a reliable windowTracker
    if (cleanupEnabled && windowTracker) {
      debug(
        'bridge:memory',
        `Enabling periodic cleanup every ${cleanupInterval}ms (default: enabled)`,
      );
      this.cleanupTimer = setInterval(() => {
        void this.performPeriodicCleanup();
      }, cleanupInterval);
    } else {
      if (cleanupEnabled && !windowTracker) {
        debug(
          'bridge:memory',
          'Periodic cleanup disabled - no windowTracker provided (required for safe cleanup)',
        );
      } else {
        debug('bridge:memory', 'Periodic cleanup disabled (enablePeriodicCleanup: false)');
      }
    }
  }

  addSubscriptionManager(windowId: number, manager: SubscriptionManager<State>): void {
    // Prevent unbounded growth by removing oldest entries
    if (this.subscriptionManagers.size >= this.MAX_SUBSCRIPTION_MANAGERS) {
      const oldestEntry = this.subscriptionManagers.entries().next().value;
      if (oldestEntry) {
        debug(
          'bridge:memory',
          `Removing oldest subscription manager for window ${oldestEntry[0]} to prevent memory leak`,
        );
        this.removeSubscriptionManager(oldestEntry[0]);
      }
    }
    this.subscriptionManagers.set(windowId, manager);
  }

  getSubscriptionManager(windowId: number): SubscriptionManager<State> | undefined {
    return this.subscriptionManagers.get(windowId);
  }

  removeSubscriptionManager(windowId: number): void {
    this.subscriptionManagers.delete(windowId);
    this.destroyListenerSet.delete(windowId);
  }

  hasDestroyListener(windowId: number): boolean {
    return this.destroyListenerSet.has(windowId);
  }

  addDestroyListener(windowId: number): void {
    this.destroyListenerSet.add(windowId);
  }

  setMiddlewareCallbacks(callbacks: MiddlewareCallbacks): void {
    this.middlewareCallbacks = { ...callbacks };
    const callbackKeys = Object.keys(callbacks);
    debug('core', `Middleware callbacks set (${callbackKeys.length}): ${callbackKeys.join(', ')}`);
  }

  getMiddlewareCallbacks(): MiddlewareCallbacks {
    return this.middlewareCallbacks;
  }

  private async performPeriodicCleanup(): Promise<void> {
    debug(
      'bridge:memory',
      `Performing periodic cleanup of ${this.subscriptionManagers.size} subscription managers`,
    );

    // windowTracker is guaranteed to exist when periodic cleanup is enabled
    const windowTracker = this.windowTracker as WebContentsTracker;

    // Get currently active window IDs from the window tracker
    let activeWebContents = windowTracker.getActiveWebContents();

    // Safety check: If tracker returns empty array but we have subscription managers,
    // the tracker may have failed. Use Electron's WebContents directly as fallback.
    if (activeWebContents.length === 0 && this.subscriptionManagers.size > 0) {
      debug(
        'bridge:memory',
        'Window tracker returned empty array but subscription managers exist - using Electron WebContents fallback',
      );
      try {
        const { webContents } = await import('electron');
        activeWebContents = webContents.getAllWebContents().filter((wc) => !wc.isDestroyed());
        debug('bridge:memory', `Fallback found ${activeWebContents.length} active WebContents`);
      } catch (error) {
        debug('bridge:memory', 'Failed to import electron for fallback cleanup:', error);
        // If we can't get real WebContents, skip cleanup to avoid false positives
        return;
      }
    }

    const activeWindowIds = new Set(activeWebContents.map((wc) => wc.id));

    // Remove subscription managers for windows that are no longer active
    let cleanedCount = 0;
    for (const [windowId] of this.subscriptionManagers.entries()) {
      if (!activeWindowIds.has(windowId)) {
        debug('bridge:memory', `Removing subscription manager for destroyed window ${windowId}`);
        this.removeSubscriptionManager(windowId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      debug(
        'bridge:memory',
        `Cleaned up ${cleanedCount} subscription managers for destroyed windows`,
      );
    } else {
      debug('bridge:memory', 'No stale subscription managers found');
    }
  }

  getAllSubscriptionManagers(): Map<number, SubscriptionManager<State>> {
    return new Map(this.subscriptionManagers);
  }

  clearAll(): void {
    debug('bridge:memory', 'Clearing all subscription managers and callbacks');
    this.subscriptionManagers.clear();
    this.destroyListenerSet.clear();
    this.middlewareCallbacks = {};

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}
