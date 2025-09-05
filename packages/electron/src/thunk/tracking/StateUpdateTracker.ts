import { debug } from '@zubridge/core';

/**
 * Tracks state updates pending acknowledgment from renderer processes
 */
export interface PendingStateUpdate {
  updateId: string;
  thunkId: string;
  subscribedRenderers: Set<number>; // window IDs
  acknowledgedBy: Set<number>; // window IDs that sent ACK
  timestamp: number;
}

/**
 * Manages state update tracking and acknowledgments from renderers
 */
export class StateUpdateTracker {
  /**
   * Tracks state updates pending acknowledgment from renderers
   */
  private pendingStateUpdates = new Map<string, PendingStateUpdate>();

  /**
   * Maps thunk ID to set of pending update IDs for that thunk
   */
  private thunkPendingUpdates = new Map<string, Set<string>>();

  /**
   * Track a state update for thunk completion
   * The thunk will not be considered complete until all renderers acknowledge this update
   */
  trackStateUpdateForThunk(
    thunkId: string,
    updateId: string,
    subscribedRendererIds: number[],
  ): void {
    debug('thunk', `Tracking state update ${updateId} for thunk ${thunkId}`);

    // Create pending state update entry
    this.pendingStateUpdates.set(updateId, {
      updateId,
      thunkId,
      subscribedRenderers: new Set(subscribedRendererIds),
      acknowledgedBy: new Set(),
      timestamp: Date.now(),
    });

    // Track this update ID for the thunk
    if (!this.thunkPendingUpdates.has(thunkId)) {
      this.thunkPendingUpdates.set(thunkId, new Set());
    }
    const thunkUpdates = this.thunkPendingUpdates.get(thunkId);
    if (thunkUpdates) {
      thunkUpdates.add(updateId);
    }
  }

  /**
   * Mark a renderer as having acknowledged a state update
   * Returns true if all renderers have now acknowledged this update
   */
  acknowledgeStateUpdate(updateId: string, rendererId: number): boolean {
    const update = this.pendingStateUpdates.get(updateId);
    if (!update) {
      debug('thunk', `No pending state update found for ID: ${updateId}`);
      return true; // Treat unknown updates as acknowledged (source commit behavior)
    }

    if (!update.subscribedRenderers.has(rendererId)) {
      debug(
        'thunk',
        `Renderer ${rendererId} not subscribed to state update ${updateId}, ignoring ACK`,
      );
      return false; // This renderer wasn't supposed to receive this update
    }

    update.acknowledgedBy.add(rendererId);
    const allAcknowledged = update.acknowledgedBy.size >= update.subscribedRenderers.size;

    if (allAcknowledged) {
      debug('thunk', `All renderers acknowledged state update ${updateId}`);
      this.pendingStateUpdates.delete(updateId);

      // Remove from thunk's pending updates
      const thunkUpdates = this.thunkPendingUpdates.get(update.thunkId);
      if (thunkUpdates) {
        thunkUpdates.delete(updateId);
        if (thunkUpdates.size === 0) {
          this.thunkPendingUpdates.delete(update.thunkId);
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Remove a dead renderer from all pending state updates
   * This should be called when a window is destroyed to prevent hanging acknowledgments
   */
  cleanupDeadRenderer(rendererId: number): void {
    debug('thunk', `Cleaning up dead renderer ${rendererId} from pending state updates`);

    const updatesToCheck = Array.from(this.pendingStateUpdates.values());

    for (const update of updatesToCheck) {
      if (update.subscribedRenderers.has(rendererId)) {
        // Remove the dead renderer from subscribed renderers
        update.subscribedRenderers.delete(rendererId);

        // Check if all remaining renderers have acknowledged
        const allAcknowledged = update.acknowledgedBy.size >= update.subscribedRenderers.size;

        if (allAcknowledged) {
          debug(
            'thunk',
            `State update ${update.updateId} now fully acknowledged after cleaning up dead renderer`,
          );
          this.pendingStateUpdates.delete(update.updateId);

          // Remove from thunk's pending updates
          const thunkUpdates = this.thunkPendingUpdates.get(update.thunkId);
          if (thunkUpdates) {
            thunkUpdates.delete(update.updateId);
            if (thunkUpdates.size === 0) {
              this.thunkPendingUpdates.delete(update.thunkId);
            }
          }
        }
      }
    }
  }

  /**
   * Check if a thunk has pending state updates
   */
  hasPendingStateUpdates(thunkId: string): boolean {
    const pendingUpdates = this.thunkPendingUpdates.get(thunkId);
    return pendingUpdates ? pendingUpdates.size > 0 : false;
  }

  /**
   * Clean up expired pending state updates (prevent memory leaks)
   */
  cleanupExpiredUpdates(maxAgeMs = 30000): void {
    const now = Date.now();
    const expiredUpdates: string[] = [];

    for (const [updateId, update] of this.pendingStateUpdates) {
      if (now - update.timestamp > maxAgeMs) {
        expiredUpdates.push(updateId);
      }
    }

    for (const updateId of expiredUpdates) {
      const update = this.pendingStateUpdates.get(updateId);
      if (update) {
        debug('thunk', `Cleaning up expired state update ${updateId} for thunk ${update.thunkId}`);
        this.pendingStateUpdates.delete(updateId);

        // Remove from thunk's pending updates
        const thunkUpdates = this.thunkPendingUpdates.get(update.thunkId);
        if (thunkUpdates) {
          thunkUpdates.delete(updateId);
          if (thunkUpdates.size === 0) {
            this.thunkPendingUpdates.delete(update.thunkId);
          }
        }
      }
    }
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.pendingStateUpdates.clear();
    this.thunkPendingUpdates.clear();
  }

  /**
   * Get the count of pending updates for debugging
   */
  getPendingUpdateCount(): number {
    return this.pendingStateUpdates.size;
  }
}
