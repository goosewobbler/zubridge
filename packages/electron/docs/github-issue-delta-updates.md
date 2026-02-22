# Implement Delta Updates for State Synchronization

## Problem Statement

Currently, Zubridge sends the **entire value** of subscribed state keys over IPC on every update, not just the changes (deltas). This creates significant performance overhead for applications with large state structures, especially arrays.

### Example Scenario

In a chat application with rapid streaming updates:
- User subscribes to `messages` key
- State contains `messages: [msg1, msg2, ..., msg10000]` (10,000 messages)
- Every update serializes/deserializes all 10,000 message objects
- For high-frequency updates (e.g., streaming), this becomes a major bottleneck

### Current Behavior

Zubridge does optimize by only sending subscribed keys (not the full state), but it sends the **complete value** of those keys. The `SubscriptionManager.notify()` method:
1. Checks if subscribed keys changed using `hasRelevantChange()`
2. If changed, extracts the full value via `getPartialState(next, keys)`
3. Sends that complete partial state over IPC

### Performance Impact

Our middleware prototyping showed that filtering by keys (subscribing to 1 key out of 10,000 keys in the state object) provides negligible performance improvement - the IPC serialization overhead dominates. However, this finding was about state objects with many keys, not about the case where a single key contains a large array. The user's concern is valid because even though they're only subscribed to 1 key (`messages`), that key contains a massive array, and all items in that array get serialized on every update.

## Proposed Solution

Implement delta calculation to send only the changed portions of state, rather than the complete values of subscribed keys.

### Implementation Approach

1. **Delta Calculation**: Compare previous and current state values for subscribed keys
2. **Deep Diffing**: For arrays and objects, calculate what actually changed (added, removed, modified items)
3. **Delta Format**: Send structured deltas that can be efficiently merged on the renderer side
4. **Fallback**: If delta calculation fails or is too expensive, fall back to full value (backward compatible)

### Delta Format Options

**Option A: Patch-based (JSON Patch-like)**
```typescript
{
  type: 'delta',
  path: 'messages',
  operations: [
    { op: 'add', path: '/9999', value: newMessage },
    { op: 'replace', path: '/0/timestamp', value: updatedTimestamp }
  ]
}
```

**Option B: Structural diff**
```typescript
{
  type: 'delta',
  path: 'messages',
  added: [newMessage],
  modified: [{ index: 0, changes: { timestamp: updatedTimestamp } }],
  removed: []
}
```

**Option C: Incremental array updates**
```typescript
{
  type: 'delta',
  path: 'messages',
  append: [newMessage],  // For append-only scenarios
  // or
  splice: { index: 0, deleteCount: 1, items: [replacementMessage] }
}
```

## Use Cases

- **Chat applications**: Large message arrays with frequent appends
- **Data dashboards**: Large datasets with incremental updates
- **Real-time monitoring**: High-frequency state updates with large payloads
- **Trading platforms**: Rapid price updates in large market data structures

## Related Context

- **Middleware Prototype**: The Rust middleware already has `calculate_state_delta` functionality that could be adapted
- **Rust Core Migration**: This feature should be implemented as part of the Rust core migration ([#104](https://github.com/goosewobbler/zubridge/issues/104))
- **Call Batching**: Delta updates may provide more immediate benefit than call batching ([#120](https://github.com/goosewobbler/zubridge/issues/120)) for use cases with large state structures

## Acceptance Criteria

- [ ] Delta calculation implemented for arrays (detect additions, removals, modifications)
- [ ] Delta calculation implemented for objects (detect property changes)
- [ ] Delta format is efficient to serialize/deserialize
- [ ] Renderer can merge deltas into local state correctly
- [ ] Fallback to full value if delta calculation fails (backward compatible)
- [ ] Performance benchmarks show measurable improvement for large arrays
- [ ] No regression in functionality or correctness
- [ ] Works across all platforms (Electron, Tauri, future targets)
- [ ] Configuration option to enable/disable delta updates (for debugging/compatibility)

## Implementation Notes

- Consider using a library like `fast-diff` or `deep-diff` for efficient comparison
- Delta calculation should be configurable (enable/disable, max depth, etc.)
- Performance measurement should be integrated to validate improvements

## Priority

**High** - Directly addresses performance concerns for real-world use cases with large state structures. Should be prioritized alongside or before call batching for applications with large arrays/objects.





