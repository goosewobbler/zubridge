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

## Removed Deprecated Aliases

The following deprecated aliases have been removed in v3:

| Removed Export | Replacement |
|---|---|
| `mainZustandBridge` (from `@zubridge/electron`) | `createZustandBridge` |
| `preloadZustandBridge` (from `@zubridge/electron/preload`) | `preloadBridge` |
| `PreloadZustandBridge` type (from `@zubridge/electron/preload`) | `PreloadBridge` |

**Before (v2):**

```typescript
// Main process
import { mainZustandBridge } from '@zubridge/electron';
const bridge = mainZustandBridge(store);

// Preload script
import { preloadZustandBridge } from '@zubridge/electron/preload';
const { handlers } = preloadZustandBridge();
```

**After (v3):**

```typescript
// Main process
import { createZustandBridge } from '@zubridge/electron';
const bridge = createZustandBridge(store);

// Preload script
import { preloadBridge } from '@zubridge/electron/preload';
const { handlers } = preloadBridge();
```

## Dispatch Signature: String Form Clarified

In v2, the second argument to `dispatch(string, ...)` was duck-typed — it could be either payload or `DispatchOptions` depending on its shape. In v3, the convention is unambiguous:

- **arg2** is always **payload**
- **arg3** (optional) is always **options**

```typescript
// String dispatch signatures in v3:
dispatch(action: string, payload?: unknown): Promise<unknown>;
dispatch(action: string, payload: unknown, options: DispatchOptions): Promise<unknown>;
```

**Before (v2) — options as second arg (duck-typed):**

```typescript
dispatch('URGENT_ACTION', { immediate: true });           // options duck-typed from payload
dispatch('ADMIN_UPDATE', data, { keys: ['admin'] });      // 3-arg also worked
```

**After (v3) — explicit positional args:**

```typescript
dispatch('URGENT_ACTION', undefined, { immediate: true }); // payload=undefined, options
dispatch('ADMIN_UPDATE', data, { keys: ['admin'] });       // payload=data, options — unchanged
```

You can also use the action object form:

```typescript
dispatch({ type: 'URGENT_ACTION' }, { immediate: true });
dispatch({ type: 'ADMIN_UPDATE', payload: data }, { keys: ['admin'] });
```

String dispatch without options is unchanged:

```typescript
// These still work
dispatch('INCREMENT');
dispatch('SET_VALUE', 42);
```

**Important: 2-arg `dispatch(string, options)` callers.** If you were passing `DispatchOptions` as the second argument to a string dispatch (without a payload), those options are now silently treated as payload. Because `payload` is typed `unknown`, TypeScript will **not** catch this — the call compiles without error but the options are ignored at runtime. Search your codebase for string dispatch calls where the second argument contains `immediate`, `batch`, `keys`, or `bypassAccessControl` to find calls that need updating.

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
