# Migration Guide: v2 → v3

This guide highlights the breaking changes when moving from v2 to v3 and actions needed for smooth upgrades.

## Renamed Dispatch Option: `bypassThunkLock` → `immediate`

The `bypassThunkLock` option has been renamed to `immediate` to better describe its behaviour — it bypasses the batch window, action queue, and concurrency controls, not just the thunk lock.

### Update Dispatch Calls

**Before (v2):**

```typescript
dispatch({ type: 'URGENT_ACTION' }, { bypassThunkLock: true });
```

**After (v3):**

```typescript
dispatch({ type: 'URGENT_ACTION' }, { immediate: true });
```

### Update Internal Flags

If you reference internal action flags directly (uncommon):

| v2 | v3 |
|----|-----|
| `action.__bypassThunkLock` | `action.__immediate` |
| `PRIORITY_LEVELS.BYPASS_THUNK_LOCK` | `PRIORITY_LEVELS.IMMEDIATE` |

## Renamed Window Property: `bypassFlags` → `dispatchFlags`

The `window.bypassFlags` property has been renamed since it now contains both bypass and non-bypass flags.

**Before (v2):**

```typescript
declare global {
  interface Window {
    bypassFlags?: {
      bypassAccessControl: boolean;
      bypassThunkLock: boolean;
    };
  }
}
```

**After (v3):**

```typescript
declare global {
  interface Window {
    dispatchFlags?: {
      bypassAccessControl: boolean;
      immediate: boolean;
    };
  }
}
```

## Renderer Validation Enabled by Default

In v3, renderer-side action validation is enabled in development mode (warn level). Invalid actions that were silently accepted in v2 will now produce console warnings.

**What you'll see:**

```typescript
dispatch({ type: 'REALLY_LONG_TYPE_NAME'.repeat(50) });

// Console output in development:
// ⚠️ [Zubridge] Invalid action dispatch: action.type: String must contain at most 200 character(s)
```

### Options

**Fix invalid actions (recommended):**

```typescript
// Before (invalid)
dispatch({ type: 'x'.repeat(300) });

// After (valid)
dispatch({ type: 'SHORTENED_TYPE' });
```

**Disable temporarily:**

```bash
ZUBRIDGE_RENDERER_VALIDATION=off npm start
```

**Use strict mode in CI:**

```bash
ZUBRIDGE_RENDERER_VALIDATION=error npm test
```

See [Validation](../validation.md) for full details on validation rules and configuration.

## Dispatch Signature: 3-arg String Form Removed

The 3-argument string dispatch form `dispatch(string, payload, options)` has been removed. To pass `DispatchOptions`, use the action object form instead.

**Before (v2):**

```typescript
dispatch('URGENT_ACTION', payload, { immediate: true });
dispatch('ADMIN_UPDATE', data, { keys: ['admin'] });
dispatch('ACTION', undefined, { batch: true });
```

**After (v3):**

```typescript
dispatch({ type: 'URGENT_ACTION', payload }, { immediate: true });
dispatch({ type: 'ADMIN_UPDATE', payload: data }, { keys: ['admin'] });
dispatch({ type: 'ACTION' }, { batch: true });
```

String dispatch without options is unchanged:

```typescript
// These still work
dispatch('INCREMENT');
dispatch('SET_VALUE', 42);
```

**Why:** The 3-arg form created ambiguity where the second argument could be either payload or options depending on the first argument's type. The 2-arg convention eliminates this: string actions always get payload, object/thunk actions always get options.

**JavaScript callers:** A runtime warning is logged if a third argument is detected with a string action, since JavaScript won't produce a compile error.

## Strict Action Schema

Actions are now validated against a strict Zod schema that rejects unknown properties. If you were passing extra fields on actions, they will be rejected:

```typescript
// Before (v2) - silently passed through
dispatch({ type: 'TEST', customField: 'data' });

// After (v3) - rejected with "Unrecognized key(s) in object"
dispatch({ type: 'TEST', payload: { customField: 'data' } });
```

Move custom data into the `payload` field.

## Action Batching

v3 introduces renderer-side action batching, enabled by default. This groups multiple actions dispatched within a 16ms window into a single IPC call.

This is not a breaking change for most users — existing `dispatch()` calls work as before. However, if your code depends on actions being processed one-at-a-time in exact dispatch order, be aware that batched actions are sent together.

To disable batching:

```typescript
preloadBridge({ enableBatching: false });
```

See [Performance](../performance.md) for batching configuration and tuning.
