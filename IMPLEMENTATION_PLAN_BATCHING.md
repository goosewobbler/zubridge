# Cross-Boundary Action Batching Implementation Plan

> **Ticket**: Cross-Boundary Call Batching for Electron
> **Scope**: Action batching only (Delta updates: separate ticket)
> **Timeline**: 1 week
> **Target Release**: v1.4.0

---

## Executive Summary

Implement renderer-side action batching that groups multiple actions into single IPC calls to the main process. This addresses the primary bottleneck: high-frequency state updates (animations, real-time data, rapid user interactions) creating communication overhead.

**Expected Impact**:
- 80-95% reduction in IPC calls for high-frequency updates
- 20-40% improvement in action latency
- Minimal overhead for infrequent actions

---

## Architecture Understanding

### Current Flow
```
Renderer Process
  ↓ Individual action dispatch (60x/second)
IPC: zubridge:dispatch
  ↓
Main Process
  → ActionScheduler processes each action
  → StateManager updates
  → SubscriptionManager notifies renderers
  ↓
IPC: zubridge:state-update (60x/second × N windows)
```

### With Batching
```
Renderer Process
  ↓ Batched actions (1 IPC every 16ms)
IPC: zubridge:batch-dispatch (3-4x/second)
  ↓
Main Process
  → Process each action individually (user's store)
  → SubscriptionManager notifies renderers (unchanged)
  ↓
IPC: zubridge:batch-ack (3-4x/second)
```

**Key Insight**: Renderer stores receive pre-computed state. We reduce renderer→main IPC. Main→renderer notifications remain unchanged (delta updates will address this separately).

---

## Implementation Requirements

### Core Features
1. **Action Batching**: Group multiple actions within configurable time window
2. **Priority-Aware Flushing**: High-priority actions trigger immediate flush
3. **Backpressure Handling**: Queue low-priority actions during active flush
4. **Cancellation Support**: Remove actions from queue before flush
5. **Configurable Parameters**: Window size, max batch size, priority threshold

### Integration Requirements
1. **Respect Priority System**: Use existing `__bypassThunkLock` flag
2. **Maintain Thunk Semantics**: No changes to thunk execution or lifecycle
3. **Preserve Action Order**: Actions executed in order received
4. **Backward Compatible**: Fallback to direct dispatch if batching disabled

---

## Day-by-Day Implementation Plan

### Day 1: ActionBatcher Core

**File**: `packages/electron/src/batching/ActionBatcher.ts`

#### Tasks:
- [ ] Create `ActionBatcher` class with queue management
- [ ] Implement `enqueue()` with backpressure logic
- [ ] Implement `flush()` with force option
- [ ] Implement priority-aware flush conditions
- [ ] Add cancellation support for queued actions
- [ ] Implement batch ID generation
- [ ] Add debug logging throughout

#### Key Methods:
```typescript
enqueue(action, resolve, reject, priority): string
flush(force = false): Promise<void>
shouldFlushNow(priority): boolean
scheduleFlush(): void
sendBatchToMain(batch): Promise<void>
addToQueue(...): string
removeAction(action): void
getStats(): BatchStats
destroy(): void
```

#### Deliverable:
- Working ActionBatcher with unit test coverage

---

### Day 2: Configuration & Types

**Files**:
- `packages/electron/src/batching/types.ts` (NEW)
- `packages/electron/src/types/preload.ts` (MODIFIED)
- `packages/electron/src/utils/configuration.ts` (MODIFIED)

#### Tasks:
- [ ] Define `BatchPayload` and `BatchAckPayload` types
- [ ] Define `BatchStats` interface
- [ ] Add `enableBatching` option to `PreloadOptions`
- [ ] Add `batching` configuration object to `PreloadOptions`
- [ ] Add `BATCHING_DEFAULTS` constants
- [ ] Implement `getBatchingConfig()` helper function

#### Configuration Options:
```typescript
interface BatchingConfig {
  windowMs: number;           // Default: 16ms
  maxBatchSize: number;        // Default: 50
  priorityFlushThreshold: number;  // Default: 80
}
```

#### Deliverable:
- Type-safe configuration system with defaults

---

### Day 3: Preload Integration

**File**: `packages/electron/src/preload.ts` (MODIFIED)

#### Tasks:
- [ ] Initialize ActionBatcher based on configuration
- [ ] Wrap `actionSender` to use batcher
- [ ] Implement priority calculation helper
- [ ] Add batch acknowledgment listener
- [ ] Handle batching disable fallback

#### Integration Points:
```typescript
// In preloadBridge<S>
const actionBatcher = new ActionBatcher(batchingConfig);

// In thunkProcessor.initialize
actionSender: async (action, parentId) => {
  const priority = calculatePriority(action);
  return actionBatcher.enqueue(action, resolve, reject, priority);
}

// Priority calculation
function calculatePriority(action): number {
  if (action.__bypassThunkLock) return 100;
  if (action.__thunkParentId) return 70;
  return 50;
}
```

#### Deliverable:
- Full renderer-side batching integration

---

### Day 4: Main Process Integration

**Files**:
- `packages/electron/src/constants.ts` (MODIFIED)
- `packages/electron/src/bridge/ipc/IpcHandler.ts` (MODIFIED)

#### Tasks:
- [ ] Add `BATCH_DISPATCH` and `BATCH_ACK` channels to `IpcChannel`
- [ ] Implement `handleBatchDispatch()` method
- [ ] Process each action individually (user's store)
- [ ] Use `Promise.allSettled` for error isolation
- [ ] Send batch acknowledgment with individual results
- [ ] Add proper error handling and logging

#### Batch Handler Logic:
```typescript
handleBatchDispatch(event, batch) {
  1. Parse batch payload
  2. Process each action via processSingleAction()
  3. Collect results via Promise.allSettled()
  4. Send batch acknowledgment with results
}
```

#### Deliverable:
- Complete main process batch handling

---

### Day 5: Testing Suite

**Files**:
- `packages/electron/test/batching/ActionBatcher.spec.ts` (NEW)
- `packages/electron/test/batching/integration.spec.ts` (NEW)

#### Tasks:

**ActionBatcher.spec.ts**:
- [ ] Test batching multiple actions into single IPC call
- [ ] Test immediate flush for high-priority actions
- [ ] Test flush when batch size limit reached
- [ ] Test backpressure for low-priority actions during flush
- [ ] Test action cancellation
- [ ] Test priority-based queue ordering
- [ ] Test window timeout flush

**integration.spec.ts**:
- [ ] Test thunk actions batch correctly
- [ ] Test mixed priority actions
- [ ] Test bypassThunkLock immediate flush
- [ ] Test batch acknowledgment handling
- [ ] Test error propagation in batches
- [ ] Test batching disable fallback

#### Deliverable:
- Comprehensive test coverage (>80%)

---

### Day 6: Benchmarks

**File**: `packages/electron/benchmarks/batchingBenchmark.ts` (NEW)

#### Tasks:
- [ ] Create baseline measurement function
- [ ] Create batching-enabled measurement function
- [ ] Implement metric calculation (avg, p95, p99 latency)
- [ ] Define test scenarios:
  - [ ] 60fps animation (60 actions/second)
  - [ ] Thunk cascade (20 actions from one thunk)
  - [ ] Click storm (50 rapid user actions)
  - [ ] Normal usage (10 mixed actions)
- [ ] Implement comparison output (table format)
- [ ] Add performance tracking integration

#### Benchmark Output:
```javascript
{
  ipcCalls: number,
  averageLatency: number,
  p95Latency: number,
  p99Latency: number,
  totalActions: number,
  duration: number
}
```

#### Deliverable:
- Runnable benchmark suite with real-world scenarios

---

### Day 7: Documentation & Release

**Files**:
- `packages/electron/README.md` (MODIFIED)
- `packages/electron/CHANGELOG.md` (MODIFIED)

#### Tasks:

**README.md**:
- [ ] Add "Action Batching" section
- [ ] Document benefits (IPC reduction, latency improvement)
- [ ] Document configuration options
- [ ] Provide usage examples
- [ ] Document disable pattern

**CHANGELOG.md**:
- [ ] Add v1.4.0 entry
- [ ] List "Added" features
- [ ] Document "Performance" improvements
- [ ] List "Changed" behaviors
- [ ] Document new configuration options
- [ ] Note testing and validation

#### Documentation Content:
```markdown
## Action Batching

Action batching reduces IPC calls by grouping multiple actions.

### Configuration
```typescript
const bridge = createZubridgeBridge({
  batching: {
    windowMs: 16,
    maxBatchSize: 50,
    priorityFlushThreshold: 80
  }
});
```

### Benefits
- 80-95% reduction in IPC calls
- 20-40% latency improvement
```

#### Deliverable:
- Published npm package v1.4.0

---

## File Structure

```
packages/electron/
├── src/
│   ├── batching/
│   │   ├── ActionBatcher.ts           (NEW)
│   │   └── types.ts                  (NEW)
│   ├── bridge/
│   │   └── ipc/
│   │       └── IpcHandler.ts          (MODIFIED)
│   ├── constants.ts                   (MODIFIED)
│   ├── preload.ts                     (MODIFIED)
│   ├── types/
│   │   └── preload.ts                 (MODIFIED)
│   └── utils/
│       └── configuration.ts           (MODIFIED)
├── benchmarks/
│   └── batchingBenchmark.ts           (NEW)
├── test/
│   └── batching/
│       ├── ActionBatcher.spec.ts      (NEW)
│       └── integration.spec.ts         (NEW)
├── README.md                        (MODIFIED)
└── CHANGELOG.md                      (MODIFIED)
```

---

## Success Metrics

### Quantitative Targets
- ✅ 80-95% reduction in IPC calls for high-frequency updates
- ✅ 20-40% improvement in action latency (p50, p95, p99)
- ✅ <1% overhead for infrequent actions
- ✅ 0 action ordering violations in tests
- ✅ 0 thunk lifecycle regressions

### Test Coverage
- ✅ >80% code coverage for batching logic
- ✅ All edge cases covered (overflow, priority, backpressure)
- ✅ Integration tests validate real-world scenarios

### Performance Validation
- ✅ Benchmarks run and documented
- ✅ Baseline vs batching measured
- ✅ Real-world scenarios validated

---

## Risk Mitigation

### Potential Issues & Solutions

| Risk | Mitigation |
|-------|------------|
| **Action ordering** | Queue maintains FIFO order, priority doesn't reorder within same priority |
| **Memory leaks** | Clear promises on timeout, limit queue size, destroy method |
| **Thunk incompatibility** | Only batch `actionSender` calls, thunk execution unchanged |
| **Regression** | Comprehensive test suite, disable option available |
| **IPC channel conflicts** | Use new channel names (`zubridge:batch-dispatch`) |

### Rollback Plan
If batching causes issues:
1. Users can disable via `enableBatching: false`
2. Individual action dispatch still works
3. No breaking changes to existing code

---

## What We're NOT Doing

### Out of Scope
- ❌ **Delta updates**: Separate ticket (state synchronization optimization)
- ❌ **Bulk store operations**: Not applicable (user's store controls processing)
- ❌ **Main process notification batching**: Delta updates will address
- ❌ **Complex main process optimizations**: Sequential processing is fine
- ❌ **Rust migration**: Separate initiative

### Why Separate?
- Different code paths (renderer vs main)
- Independent value (IPC reduction vs payload reduction)
- Clearer testing and validation
- Faster time-to-ship
- Incremental user trust

---

## Testing Strategy

### Unit Tests
- **ActionBatcher**: Queue management, flush logic, priority handling, backpressure
- **Configuration**: Defaults merging, validation
- **Priority calculation**: Bypass, thunk, normal actions

### Integration Tests
- **Thunk integration**: Thunk actions batched correctly
- **Mixed priority**: High/low/normal actions interact properly
- **Error handling**: Failed actions don't block batch
- **Acknowledgment**: Batch ACK resolves all promises correctly

### Performance Tests
- **Baseline vs Batching**: Measure IPC reduction
- **Latency**: p50, p95, p99 improvements
- **Memory**: No leaks with long-running batches
- **Real scenarios**: Animation, thunk cascade, click storm

---

## Expected Performance Improvements

| Scenario | Baseline IPC Calls | With Batching | Reduction |
|----------|-------------------|----------------|------------|
| 60fps animation (60 actions) | 60 | 3-4 | 93-95% |
| Thunk cascade (20 actions) | 20 | 1 | 95% |
| Click storm (50 rapid clicks) | 50 | 10-15 | 70-80% |
| Normal usage (10 actions) | 10 | 1-2 | 80-90% |

| Metric | Baseline | With Batching | Improvement |
|--------|-----------|----------------|-------------|
| IPC call frequency (60fps) | 60/sec | 3-4/sec | 93-95% ↓ |
| Average latency | ~10ms | ~5-6ms | 40-50% ↓ |
| P95 latency | ~20ms | ~10-12ms | 40-50% ↓ |
| Overhead (infrequent) | 0 | <0.1ms | Negligible |

---

## Future Work (Separate Tickets)

### Delta Updates (Ticket TBD)
- Send only changed portions of state
- Reduce IPC payload size by 85-99%
- Implement deep diffing for arrays and objects
- Delta merging on renderer side

### Advanced Features
- Per-action batch control flags
- Adaptive batch window size
- Multi-window batching coordination
- Performance telemetry integration

---

## Checklist

### Development
- [ ] ActionBatcher implemented with all features
- [ ] Types and configuration added
- [ ] Preload integration complete
- [ ] Main process integration complete
- [ ] IPC channels added

### Testing
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Benchmarks implemented and runnable
- [ ] Test coverage >80%

### Documentation
- [ ] README updated with batching section
- [ ] CHANGELOG entry created
- [ ] Configuration documented
- [ ] Examples provided

### Release
- [ ] All tests passing
- [ ] Benchmarks run and documented
- [ ] Version bumped to 1.4.0
- [ ] npm package published
- [ ] Release notes published

---

## Implementation Dependencies

### Required
- ✅ Existing ActionScheduler (priority system)
- ✅ Existing IPC infrastructure
- ✅ Existing thunk management

### Optional
- Performance tracking (middleware integration)
- Custom batch size per action type

---

## Timeline Summary

| Day | Focus | Deliverable |
|-----|---------|-------------|
| 1 | ActionBatcher core | Batching engine |
| 2 | Types & config | Configuration system |
| 3 | Preload integration | Renderer-side batching |
| 4 | Main process integration | Complete flow |
| 5 | Testing suite | Test coverage |
| 6 | Benchmarks | Performance validation |
| 7 | Docs & release | Ship v1.4.0 |

**Total**: 7 days → shippable batching feature

---

## Questions & Decisions

### TBD
- [ ] Should `priorityFlushThreshold` be configurable per batcher instance?
- [ ] Should we expose batcher stats via preload API?
- [ ] Should we add telemetry hooks for batch metrics?
- [ ] Should batch ID be simple string or structured object?

### Decisions Made
- ✅ **Separate delta updates ticket**: Independent value, cleaner scope
- ✅ **Renderer-side batching only**: Main process sequential is fine
- ✅ **Default enabled**: Opt-in not required, can disable if needed
- ✅ **16ms default window**: Aligns with 60fps standard
- ✅ **50 max batch size**: Balance between IPC reduction and latency

---

## References

### Related Issues
- Issue #120: Cross-boundary call batching (this ticket)
- Issue #121: Delta state synchronization (future)

### Related Code
- `ActionScheduler.ts`: Priority system reference
- `IpcHandler.ts`: Current IPC handling
- `preload.ts`: Renderer entry point
- `SubscriptionManager.ts`: Notification flow (unchanged)

### Documentation
- Electron IPC documentation: https://www.electronjs.org/docs/latest/tutorial/ipc
- Performance best practices: https://web.dev/fast/

---

**End of Plan**
