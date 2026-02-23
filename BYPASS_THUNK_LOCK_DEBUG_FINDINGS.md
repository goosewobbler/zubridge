# BypassThunkLock E2E Test Failure - Debug Findings

## Summary

The `bypass-thunk-lock.spec.ts` E2E test has 1 failing test out of 6. The same tests pass on the main branch (`~/Workspace/zubridge-2`) which does not have the batching feature.

## Root Cause Identified

**The problem is that `ActionScheduler.processQueue()` is NOT called after each thunk action completes.**

### The Flow Problem

When a thunk action (like `DOUBLE:SLOW`) completes in the main process:

1. `ThunkScheduler.runningTasks.delete(task.id)` - task removed from running
2. `ThunkScheduler.processQueue()` - processes ThunkScheduler's task queue
3. **BUT** `ActionScheduler.processQueue()` is NOT called!

The `ROOT_THUNK_COMPLETED` event (which triggers `ActionScheduler.processQueue()`) only fires when the **ENTIRE** thunk completes (all actions done), NOT after each individual thunk action.

### Why This Matters

With batching, actions arrive 16ms later. When the thunk's second action completes:
1. The INCREMENT action is in the ActionScheduler queue
2. The HALVE:SLOW action hasn't arrived yet (still in renderer's batch)
3. `ActionScheduler.processQueue()` is never called because no `ROOT_THUNK_COMPLETED` event
4. HALVE:SLOW finally arrives, gets queued
5. Test times out waiting for counter to reach 5

---

## Proposed Solutions

### Option A: Flush Batches on Thunk State Changes

**Description**: When a thunk action completes, flush all pending batches from that renderer.

**How it works**: Send an IPC message to the renderer to immediately flush its batch queue when a thunk action completes in the main process.

**Pros**:
- Ensures next thunk action arrives sooner
- Reduces latency between thunk actions

**Cons**:
- **Race condition**: The flush IPC could arrive at the renderer before `runningTasks` is cleared in the main process
- The new action could arrive while the previous action's task is still in `runningTasks`
- Adds IPC overhead
- Complex timing coordination needed

**Risk**: HIGH - Race condition between flush IPC and `runningTasks` cleanup

---

### Option B: Process Queue After runningTasks is Cleared

**Description**: Ensure `ActionScheduler.processQueue()` is called AFTER `ThunkScheduler.runningTasks.delete()` completes.

**How it works**: Wire ThunkScheduler to call ActionScheduler.processQueue() after clearing runningTasks.

**Implementation location**: `ThunkScheduler.executeTask()`:
```typescript
task.handler()
  .then(() => {
    this.runningTasks.delete(task.id);
    this.emit(ThunkSchedulerEvents.TASK_COMPLETED, task);
    this.processQueue();
    // ADD HERE: this.actionScheduler.processQueue();
  });
```

**Pros**:
- Ensures queue is re-evaluated after each thunk action
- Clear ordering: runningTasks cleared first, then queue processed

**Cons**:
- Requires passing ActionScheduler reference to ThunkScheduler
- Adds coupling between the two schedulers

**Risk**: MEDIUM - Need to verify correct wiring and ordering

---

### Option C: Bypass Batching for Thunk Actions

**Description**: Thunk actions are part of the thunk's execution flow and should be dispatched immediately without batching delay.

**How it works**: Modify the batching condition to exclude thunk actions.

**Implementation** (in `preload.ts:519`):
```typescript
// Current
if (actionBatcher && !action.__bypassThunkLock) {
  batcher.enqueue(action, ...);
}

// Change to
if (actionBatcher && !action.__bypassThunkLock && !action.__thunkParentId) {
  batcher.enqueue(action, ...);
}
```

**Pros**:
- Thunk actions arrive immediately (no 16ms delay)
- **Matches main branch behavior** (no batching for thunks)
- Simple one-line change
- Regular user actions still benefit from batching

**Cons**:
- Loses batching benefits for thunk actions
- More IPC calls for thunk-heavy applications

**Risk**: LOW - This is how main branch works

---

### Option D: Call ActionScheduler.processQueue After Each Thunk Action Completes

**Description**: The issue is that `ThunkScheduler.processQueue()` only processes thunk tasks, not the ActionScheduler queue.

**The Problem**:
When a thunk action completes:
1. `ThunkScheduler.runningTasks.delete(task.id)`
2. `ThunkScheduler.processQueue()` - processes thunk task queue
3. **BUT** `ActionScheduler.processQueue()` is NOT called!

The `ROOT_THUNK_COMPLETED` event is only emitted when the ENTIRE thunk completes (all actions done), not when each individual action completes.

**The Fix**: Call `ActionScheduler.processQueue()` after each thunk action completes. This would allow queued INCREMENT to be processed sooner, rather than waiting for the entire thunk to complete.

**Alternative Implementation**: Use the existing `onActionCompleted` callback on `ActionScheduler`:

```typescript
// ActionScheduler.ts:443 - This method exists but is never called!
public onActionCompleted(actionId: string): void {
  debug('scheduler', `Action ${actionId} completed, processing queue`);
  this.processQueue();
}
```

Call it from `ThunkScheduler.executeTask()` after `runningTasks.delete()` but before the Promise resolves:

```typescript
// In ThunkScheduler.executeTask()
task.handler()
  .then(() => {
    this.runningTasks.delete(task.id);
    this.emit(ThunkSchedulerEvents.TASK_COMPLETED, task);
    this.processQueue();
    
    // ADD: Notify ActionScheduler that action completed
    if (task.actionId && this.actionScheduler) {
      this.actionScheduler.onActionCompleted(task.actionId);
    }
  });
```

**Pros**:
- Uses existing `onActionCompleted` method (already defined but unused)
- Clean callback pattern
- Allows queued actions to be processed after each thunk action, not just at thunk end

**Cons**:
- Need to wire ThunkScheduler to ActionScheduler
- Need to store `actionId` on the ThunkTask

**Risk**: LOW-MEDIUM - Uses existing infrastructure, just needs wiring

---

## Decision Matrix

| Option | Complexity | Risk | Matches Main Branch | Preserves Batching |
|--------|------------|------|---------------------|-------------------|
| A: Flush batches | High | HIGH | No | Yes |
| B: Process after clear | Medium | MEDIUM | No | Yes |
| C: Bypass batching | Low | LOW | Yes | Partial |
| D: Call onActionCompleted | Medium | LOW-MEDIUM | No | Yes |

---

## Recommendation

**Start with Option C** (bypass batching for thunk actions):
- Simplest change (one line)
- Matches main branch behavior
- Low risk
- If tests pass, we're done

**If Option C alone isn't sufficient**, combine with **Option D** (call `onActionCompleted`):
- Ensures queue is processed after each thunk action
- Uses existing callback method
- Provides defense-in-depth

---

## Files to Modify

| File | Option | Change |
|------|--------|--------|
| `packages/electron/src/preload.ts:519` | C | Add `!action.__thunkParentId` condition |
| `packages/electron/src/thunk/scheduling/ThunkScheduler.ts` | B, D | Call `actionScheduler.processQueue()` or `onActionCompleted()` |
| `packages/electron/src/action/ActionScheduler.ts` | D | Ensure `onActionCompleted` is properly wired |

---

## How to Reproduce

```bash
cd ~/Workspace/zubridge
pnpm turbo run build --filter='@zubridge/electron' --filter='@zubridge/types' --force
cd e2e
APP_DIR=electron/e2e MODE=zustand-basic SPEC_FILE="bypass-thunk-lock.spec.ts" pnpm run exec
```

---

## Related Files

- Main branch (passing tests): `~/Workspace/zubridge-2` (no batching)
- Current branch (failing tests): `~/Workspace/zubridge` (with batching)
