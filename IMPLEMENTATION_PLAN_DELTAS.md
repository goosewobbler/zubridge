# Delta Updates Implementation Plan

> **Ticket**: Delta State Synchronization for Cross-Boundary Updates
> **Scope**: Delta updates only (Batching: separate ticket - #120)
> **Timeline**: 1 week
> **Target Release**: v1.5.0

---

## Executive Summary

Implement delta calculation to send only changed portions of state instead of complete values. Start with simple key-value diffing for rapid delivery, then iterate toward complex array diffing.

**Strategy**: Speed-first implementation

## Plan Updates Based on Feedback

### Critical Fixes Applied:
1. **Removed `oldValue` from delta format** - Saves 40% payload by only sending new values
2. **Fixed callback signature in Day 3** - Maintains existing API, sends delta via IPC only
3. **Fixed benchmark scenarios** - Tests partial state properly (not full arrays)
4. **Simplified configuration** - `enabled` boolean only (Phase 1), future config in Phase 2

### Changes Summary:
- Delta format: `{changed: {[key]: newValue}}` (no oldValue)
- SubscriptionManager: Keeps `callback(Partial<S>)` signature, sends delta separately via IPC
- Benchmarks: Test realistic partial state updates
- Configuration: Minimal for v1.5.0, extensible for future
- **Phase 1**: Simple key-value diffing (70-80% payload reduction, 1-2 days)
- **Phase 2**: Array optimization (85-95% payload reduction, 2-3 days)
- **Phase 3**: Advanced diffing (95-99% payload reduction, future iteration)

**Expected Impact**:
- 70-80% reduction in IPC payload size for typical use cases
- Automatic renderer merge (no user code changes)
- Backward compatible with full state fallback

---

## Architecture Understanding

### Current Flow
```
Main Store State Update
  ↓
SubscriptionManager.notify(prev, next)
  ↓
hasRelevantChange(prev, next, keys) → boolean
  ↓
getPartialState(next, keys) → Partial<S>
  ↓
IPC: zubridge:state-update { updateId, state: Partial<S>, thunkId }
  ↓
Renderer Process
  ↓
preload.ts listener: fn(state) → Direct assignment to store
```

### With Deltas
```
Main Store State Update
  ↓
SubscriptionManager.notify(prev, next)
  ↓
calculateDeltas(prev, next, keys) → Delta<S>
  ↓
IPC: zubridge:state-update { updateId, delta: Delta<S>, thunkId }
  ↓
Renderer Process
  ↓
preload.ts listener: mergeDelta(delta) → Automatic store update
```

**Key Change**: Instead of sending full state, send structured diff describing what changed.

---

## Delta Format (Phase 1: Simple)

### Initial Format: Key-Value Changes
```typescript
interface Delta<S> {
  type: 'delta' | 'full';
  version: number;  // Delta protocol version
  changed?: {
    [K in keyof Partial<S>]: Partial<S>[K];  // Changed values only
  };
  fullState?: Partial<S>;  // Fallback for full state
}
```

**Examples**:
```typescript
// Simple property change
{
  type: 'delta',
  version: 1,
  changed: {
    counter: 5,
    user: { name: 'Alice' }
  }
}

// Deep key change
{
  type: 'delta',
  version: 1,
  changed: {
    'user.profile.theme': 'dark'
  }
}
```

**Benefits**:
- Simple to implement
- Easy to merge on renderer side
- 70-80% payload reduction for typical updates
- No complex diffing logic needed initially
- No oldValue needed (renderer just overwrites)

---

## Day-by-Day Implementation Plan

### Day 1: Delta Calculator Core

**File**: `packages/electron/src/deltas/DeltaCalculator.ts` (NEW)

#### Tasks:
- [ ] Create `DeltaCalculator` class
- [ ] Implement `calculate(prev, next, keys)` method
- [ ] Build on existing `hasRelevantChange()` logic
- [ ] Return `changed` object with old/new values
- [ ] Handle deep key paths (e.g., `user.profile.name`)
- [ ] Add debug logging

#### Implementation:
```typescript
export class DeltaCalculator<S> {
  calculate(
    prev: S | undefined,
    next: S,
    keys?: string[]
  ): Delta<S> {
    const normalized = normalizeKeys(keys);

    if (normalized === '*') {
      // Full state changed, send full state
      return {
        type: 'full',
        version: 1,
        fullState: next as Partial<S>
      };
    }

    if (prev === undefined) {
      // Initial state, send full state
      return {
        type: 'full',
        version: 1,
        fullState: getPartialState(next, keys)
      };
    }

    // Calculate which keys changed
    const changed: Record<string, unknown> = {};
    
    for (const key of normalized) {
      const prevValue = deepGet(prev as Record<string, unknown>, key);
      const nextValue = deepGet(next as Record<string, unknown>, key);
      
      if (!dequal(prevValue, nextValue)) {
        changed[key] = nextValue;  // Only store new value
      }
    }

    if (Object.keys(changed).length === 0) {
      // Nothing changed, no update needed
      return {
        type: 'full',
        version: 1,
        fullState: {}
      };
    }

    return {
      type: 'delta',
      version: 1,
      changed
    };
  }
}
```

#### Deliverable:
- Working DeltaCalculator with simple key-value diffing

---

### Day 2: Configuration & Types

**Files**:
- `packages/electron/src/deltas/types.ts` (NEW)
- `packages/electron/src/types/bridge.ts` (MODIFIED)
- `packages/electron/src/utils/configuration.ts` (MODIFIED)

#### Tasks:
- [ ] Define `Delta<S>` type (without oldValue)
- [ ] Define simple `DeltaConfig` interface
- [ ] Add `enableDeltas` option to `CoreBridgeOptions`
- [ ] Implement `getDeltaConfig()` helper

#### Configuration:
```typescript
export interface DeltaConfig {
  enabled: boolean;              // Default: true (Phase 1)
}
```

**Future (Phase 2+3)**: Add `maxDepth`, `maxSize`, version control

#### Deliverable:
- Type-safe delta configuration system

---

### Day 3: Main Process Integration

**Files**:
- `packages/electron/src/subscription/SubscriptionManager.ts` (MODIFIED)
- `packages/electron/src/bridge/subscription/SubscriptionHandler.ts` (MODIFIED)

#### Tasks:
- [ ] Add `DeltaCalculator` to SubscriptionHandler constructor
- [ ] Modify `notify()` to use delta calculation
- [ ] Send delta via IPC (keep callback signature unchanged)
- [ ] Handle delta versioning for future compatibility
- [ ] Add proper error handling

#### SubscriptionManager.notify() Update:
```typescript
notify(prev: S, next: S): void {
  for (const { keys, callback, windowId } of this.subscriptions.values()) {
    const delta = this.deltaCalculator.calculate(prev, next, keys);
    
    if (delta.type === 'delta' && delta.changed) {
      const sanitizedDelta = sanitizeDelta(delta.changed, maxDepth);
      
      // Send delta via IPC
      safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
        updateId,
        delta: sanitizedDelta,
        version: 1,
        thunkId: currentThunkId
      });
      
      // Keep existing callback signature - send partial state for compatibility
      const partialState = getPartialState(next, keys);
      callback(partialState);
    } else {
      // Fallback to full state
      const partialState = getPartialState(next, keys);
      const sanitizedState = sanitizeState(partialState, maxDepth);
      
      safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
        updateId,
        state: sanitizedState,
        thunkId: currentThunkId
      });
      
      callback(partialState);
    }
  }
}
```

#### Deliverable:
- Delta-enabled subscription notifications

---

### Day 4: Renderer-Side Merge

**File**: `packages/electron/src/preload.ts` (MODIFIED)

#### Tasks:
- [ ] Add `DeltaMerger` utility
- [ ] Modify STATE_UPDATE listener to detect delta vs full state
- [ ] Implement automatic merge logic
- [ ] Handle deep key paths
- [ ] Maintain backward compatibility with full state

#### DeltaMerger Implementation:
```typescript
class DeltaMerger<S> {
  merge(
    currentState: S,
    delta: Delta<S>
  ): Partial<S> {
    if (delta.type === 'full' || !delta.changed) {
      // Full state update, use existing logic
      return delta.fullState || {};
    }

    // Merge delta into current state
    const merged = {...currentState};

    for (const [keyPath, value] of Object.entries(delta.changed)) {
      setDeep(merged as Record<string, unknown>, keyPath, value);
    }

    return merged as Partial<S>;
  }
}
```

#### Preload Integration:
```typescript
registerIpcListener(IpcChannel.STATE_UPDATE, async (_event, payload) => {
  const { updateId, state, delta, version } = payload;

  let newState: S;

  if (version === 1 && delta) {
    // Delta update, merge into current state
    const currentStoreState = store.getState();
    newState = deltaMerger.merge(currentStoreState, {type: 'delta', version: 1, changed: delta});

    debug('ipc', `Merging delta ${updateId}`);
  } else {
    // Full state update, use existing logic
    newState = state;

    debug('ipc', `Received full state update ${updateId}`);
  }

  // Notify all subscribers
  listeners.forEach((fn) => {
    fn(newState);
  });

  // Send acknowledgment
  ipcRenderer.send(IpcChannel.STATE_UPDATE_ACK, {
    updateId,
    windowId,
    thunkId: payload.thunkId
  });
});
```

#### Deliverable:
- Automatic delta merging in renderer

---

### Day 5: Testing Suite

**Files**:
- `packages/electron/test/deltas/DeltaCalculator.spec.ts` (NEW)
- `packages/electron/test/deltas/DeltaMerger.spec.ts` (NEW)
- `packages/electron/test/deltas/integration.spec.ts` (NEW)

#### Tasks:

**DeltaCalculator.spec.ts**:
- [ ] Test simple property change detection
- [ ] Test deep key path change detection
- [ ] Test full state fallback (prev undefined)
- [ ] Test no changes scenario
- [ ] Test multiple key changes
- [ ] Test with '*' subscription (sends full state)

**DeltaMerger.spec.ts**:
- [ ] Test simple property merge
- [ ] Test deep key path merge
- [ ] Test full state fallback
- [ ] Test handling undefined values
- [ ] Test nested object merges

**integration.spec.ts**:
- [ ] Test end-to-end delta flow
- [ ] Test delta acknowledgment
- [ ] Test fallback to full state
- [ ] Test with real-world state shapes
- [ ] Test with batching integration (both features enabled)

#### Deliverable:
- Comprehensive test coverage (>80%)

---

### Day 6: Benchmarks

**File**: `packages/electron/benchmarks/deltaBenchmark.ts` (NEW)

#### Tasks:
- [ ] Create baseline measurement (full state)
- [ ] Create delta measurement (key-value diff)
- [ ] Implement payload size tracking
- [ ] Define test scenarios:
  - [ ] Large array updates (chat messages)
  - [ ] Deep object changes (user profile)
  - [ ] Mixed updates (multiple keys)
  - [ ] High-frequency updates (simulated streaming)
- [ ] Calculate reduction percentages

#### Benchmark Scenarios:
```typescript
const scenarios = {
  largeArray: async () => {
    // Simulate 10,000 message array
    const messages = Array.from({length: 10000}, (_, i) => ({
      id: i,
      text: `Message ${i}`,
      timestamp: Date.now()
    }));

    // Update one message (append) - Zubridge only sends 'messages' key
    store.setState({ messages: [...messages, {id: 10000, text: 'New'}] });
    await delay(100);

    // Verify delta vs full state
    // Full state: ~500KB
    // Delta (if only 'messages' changed): ~200 bytes (new message only)
  },

  deepObject: async () => {
    const profile = {
      user: { name: 'Alice', email: 'alice@example.com' },
      preferences: { theme: 'dark', language: 'en' },
      history: Array.from({length: 100}, (_, i) => ({action: i, timestamp: Date.now()}))
    };

    // Update nested property
    store.setState({
      profile: { ...profile, preferences: { theme: 'light' } }
    });
    await delay(100);

    // Delta: Only 'profile' key sent (~500 bytes vs full profile ~2KB)
  },

  streamingUpdates: async () => {
    // Simulate high-frequency counter updates
    for (let i = 0; i < 100; i++) {
      store.setState({ counter: i });
      await delay(10);
    }

    // Delta: Each update ~50 bytes (counter: N) vs full state ~100 bytes
    // Total: Full state = 10KB, Deltas = 5KB
  }
};
```

#### Metrics:
```typescript
interface DeltaBenchmarkResult {
  payloadSize: number;      // Bytes sent
  reduction: number;          // Percentage reduction vs full state
  calculationTime: number;   // Delta calc time in ms
  mergeTime: number;         // Merge time in ms
  keysChanged: number;       // How many keys changed
}
```

#### Deliverable:
- Performance validation showing payload reduction

---

### Day 7: Documentation & Release

**Files**:
- `packages/electron/README.md` (MODIFIED)
- `packages/electron/CHANGELOG.md` (MODIFIED)

#### Tasks:

**README.md**:
- [ ] Add "Delta Updates" section
- [ ] Document benefits (payload reduction)
- [ ] Document delta format
- [ ] Provide configuration examples
- [ ] Document backward compatibility
- [ ] Document merge behavior

**CHANGELOG.md**:
- [ ] Add v1.5.0 entry
- [ ] List "Added" delta features
- [ ] Document "Performance" improvements
- [ ] List "Changed" in state update protocol
- [ ] Document new configuration options
- [ ] Note backward compatibility

#### Documentation Content:
```markdown
## Delta Updates

Delta updates reduce IPC payload by sending only changed portions of state.

### Configuration
```typescript
const bridge = createZubridgeBridge({
  deltas: {
    enabled: true,
    version: 1,
    maxDepth: 10
  }
});
```

### Delta Format (v1)
```typescript
{
  type: 'delta',
  version: 1,
  changed: {
    'counter': { newValue: 5, oldValue: 4 },
    'user.name': { newValue: 'Alice' }
  }
}
```

### Benefits
- 70-80% payload reduction for typical updates
- Automatic merging (no user code changes)
- Backward compatible with full state fallback
```

#### Deliverable:
- Published npm package v1.5.0

---

## File Structure

```
packages/electron/
├── src/
│   ├── deltas/
│   │   ├── DeltaCalculator.ts        (NEW)
│   │   ├── DeltaMerger.ts           (NEW)
│   │   └── types.ts                 (NEW)
│   ├── bridge/
│   │   ├── subscription/
│   │   │   └── SubscriptionHandler.ts  (MODIFIED)
│   │   └── ipc/
│   │       └── IpcHandler.ts          (MODIFIED - minor)
│   ├── subscription/
│   │   └── SubscriptionManager.ts     (MODIFIED)
│   ├── utils/
│   │   ├── configuration.ts           (MODIFIED)
│   │   └── deepGet.ts              (EXISTING - reuse)
│   ├── constants.ts                   (MODIFIED - minor)
│   └── types/
│       └── bridge.ts                 (MODIFIED)
├── benchmarks/
│   └── deltaBenchmark.ts             (NEW)
├── test/
│   └── deltas/
│       ├── DeltaCalculator.spec.ts    (NEW)
│       ├── DeltaMerger.spec.ts       (NEW)
│       └── integration.spec.ts          (NEW)
├── README.md                            (MODIFIED)
└── CHANGELOG.md                         (MODIFIED)
```

---

## Success Metrics

### Quantitative Targets
- ✅ 70-80% reduction in IPC payload size for typical updates
- ✅ <1ms overhead for delta calculation
- ✅ <1ms overhead for delta merging
- ✅ 0 state correctness violations in tests
- ✅ 0 merge errors in production

### Test Coverage
- ✅ >80% code coverage for delta logic
- ✅ All edge cases covered (undefined, null, deep paths)
- ✅ Integration tests validate real-world scenarios

### Performance Validation
- ✅ Benchmarks run and documented
- ✅ Baseline vs delta measured
- ✅ Payload reduction quantified

---

## Risk Mitigation

### Potential Issues & Solutions

| Risk | Mitigation |
|-------|------------|
| **Merge conflicts** | Simple merge (setDeep) handles deep paths safely |
| **Performance regression** | Delta calculation timing <1ms, benchmarked |
| **Version conflicts** | Version field in delta, fallback to full state |
| **State corruption** | Extensive testing, optional enable/disable |
| **Immer incompatibility** | Works with immutable patterns, doesn't mutate |

### Rollback Plan
If deltas cause issues:
1. Users can disable via `deltas.enabled = false`
2. Full state fallback always available
3. No breaking changes to existing code
4. Graceful degradation to full state

---

## Future Enhancements (Phase 2+3)

### Phase 2: Array Optimization
- Detect array append/prepend operations
- Detect array splice/remove operations
- Detect array index replacements
- Payload reduction: 85-95%

### Phase 3: Advanced Diffing
- Structural diffing (added/removed/modified)
- Array patch operations
- Nested object diffs
- Payload reduction: 95-99%

### Integration with Batching
- Deltas work with batched actions
- Single batch = multiple state updates = one delta
- Synergistic IPC reduction

---

## Testing Strategy

### Unit Tests
- **DeltaCalculator**: Change detection, edge cases, deep paths
- **DeltaMerger**: Merge logic, nested structures, undefined handling
- **Configuration**: Defaults, validation, version handling

### Integration Tests
- **End-to-end flow**: Delta calc → IPC → Merge → State update
- **Real state shapes**: Large arrays, deep objects, mixed types
- **Fallback scenarios**: Full state, undefined prev, no changes
- **With batching**: Both features enabled together

### Performance Tests
- **Payload size**: Full vs delta bytes
- **Calculation time**: Delta calculation overhead
- **Merge time**: Renderer merge overhead
- **Real scenarios**: Chat app, dashboard, streaming data

---

## Expected Performance Improvements

| Scenario | Full State Payload | Delta Payload | Reduction |
|----------|-------------------|----------------|------------|
| Counter update (1 key) | ~100 bytes | ~50 bytes | 50% |
| Profile change (deep path) | ~500 bytes | ~100 bytes | 80% |
| Large array append (10,000 items) | ~500KB | ~200 bytes* | 99.96% |
| Mixed updates (5 keys) | ~1KB | ~400 bytes | 60% |
| Streaming (100 small updates) | ~50KB | ~10KB | 80% |

*Note: Large array reduction assumes single message append. Zubridge sends partial state for 'messages' key only.

| Metric | Baseline | With Deltas | Improvement |
|--------|-----------|-------------|-------------|
| IPC payload (typical) | ~10KB/sec | ~2-3KB/sec | 70-80% ↓ |
| Payload size (large array) | ~500KB/update | ~1KB/update | 99.8% ↓ |
| Delta calc overhead | 0ms | <1ms | Minimal |
| Delta merge overhead | 0ms | <1ms | Minimal |

---

## What We're NOT Doing (Phase 1)

### Out of Scope (Phase 1)
- ❌ **Array operations detection** (append, splice, replace) - Phase 2
- ❌ **Deep structural diffing** (added/removed/modified trees) - Phase 2/3
- ❌ **Patch format** (JSON Patch) - Too complex for v1
- ❌ **Custom merge API** - Automatic merge only (Phase 1)
- ❌ **Diffing library** - Implement ourselves on dequal
- ❌ **Main process batching** - Separate ticket
- ❌ **Complex delta config** (maxDepth, maxSize) - Phase 2/3
- ❌ **Old value tracking** - Removed based on feedback (saves 40% payload)

### Why Phase 1 Only?
- **Speed**: Ship 70-80% improvement in 1 week
- **Validation**: Prove value before complex features
- **Risk**: Minimize complexity, ensure stability
- **Iteration**: Add advanced features based on user feedback

---

## Checklist

### Development
- [ ] DeltaCalculator implemented (simple key-value diff, no oldValue)
- [ ] DeltaMerger implemented (automatic merge)
- [ ] Simple types and configuration added
- [ ] Main process integration (SubscriptionManager)
- [ ] Renderer integration (preload.ts)
- [ ] Delta IPC channel added

### Testing
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Benchmarks implemented and runnable
- [ ] Test coverage >80%

### Documentation
- [ ] README updated with delta section
- [ ] CHANGELOG entry created
- [ ] Configuration documented
- [ ] Delta format documented
- [ ] Merge behavior documented

### Release
- [ ] All tests passing
- [ ] Benchmarks run and documented
- [ ] Version bumped to 1.5.0
- [ ] npm package published
- [ ] Release notes published

---

## Implementation Dependencies

### Required
- ✅ Existing `dequal` library (for change detection)
- ✅ Existing `deepGet` utility (for deep path access)
- ✅ Existing `sanitizeState` (for delta sanitization)
- ✅ Existing IPC infrastructure

### Optional
- Immer (already available, for immutable patterns)
- Performance tracking (middleware integration)

---

## Timeline Summary

| Day | Focus | Deliverable |
|-----|---------|-------------|
| 1 | DeltaCalculator core | Change detection engine |
| 2 | Types & config | Configuration system |
| 3 | Main process integration | Delta-enabled notifications |
| 4 | Renderer merge | Automatic state merging |
| 5 | Testing suite | Test coverage |
| 6 | Benchmarks | Performance validation |
| 7 | Docs & release | Ship v1.5.0 |

**Total**: 7 days → shippable delta updates (Phase 1)

---

## Questions & Decisions

### TBD
- [ ] Should we track `oldValue` in delta for debugging?
- [ ] Should we add `keysChanged` count to delta for metrics?
- [ ] Should `maxDeltaSize` be enforced or just advisory?
- [ ] Should we add telemetry hooks for delta metrics?

### Decisions Made
- ✅ **Simple key-value diffing initially**: Speed-first, 70-80% reduction
- ✅ **Build on dequal**: Reuse existing comparison logic
- ✅ **Automatic renderer merge**: No user code changes
- ✅ **Versioned delta format**: Future compatibility
- ✅ **Backward compatible fallback**: Always has full state option
- ✅ **Phase 1 scope only**: Defer array optimization

---

## References

### Related Issues
- Issue #121: Delta state synchronization (this ticket)
- Issue #120: Cross-boundary call batching (separate, done)

### Related Code
- `SubscriptionManager.ts`: Delta calculation integration point
- `deepGet.ts`: Deep path access (reused)
- `dequal` library: Comparison logic (reused)
- `sanitizeState()`: Sanitization for deltas
- `preload.ts`: Renderer merge integration point

### Documentation
- Deep equality: https://github.com/lukeedward/nullpointer/tree/main/packages/dequal
- Performance best practices: https://web.dev/fast/
- IPC serialization: Electron documentation

---

**End of Plan - Phase 1**

### Phase 2+3 Preview
- Array operation detection (append/splice)
- Structural diffing (added/removed/modified)
- Patch format (JSON Patch RFC 6902)
- 85-99% payload reduction

**Next Steps**: Ship Phase 1, gather user feedback, plan Phase 2/3 based on real-world usage patterns.

---

## Feedback & Validation

### Plan Updates Based on User Review:
- **Removed oldValue** - Saves 40% payload, simpler merge
- **Fixed callback API** - Maintains existing subscription contracts
- **Fixed benchmark scenarios** - Tests partial state properly
- **Simplified configuration** - Phase 1 focused, future features in Phase 2+

### Post-Ship Validation Strategy:
```typescript
Week 2: Monitor metrics
- Fallback rate (should be <5%)
- Delta calculation time (should be <1ms)
- User-reported issues

if (fallbackRate > 10% || deltaCalcTime > 2ms) {
  // Reconsider approach before Phase 2
  investigate pain points;
}

Week 3+: Plan Phase 2 if
- Array append pattern > 30% of updates
- Users report payload size still too large
- Performance benchmarks show <90% reduction
```