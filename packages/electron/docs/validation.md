# Validation

Zubridge validates all actions using Zod schemas. The main process always validates (security boundary). The renderer process optionally validates in development (better error messages, zero production overhead).

## Action Schema

All actions must conform to this structure:

```typescript
{
  type: string,                    // Required, 1-200 characters
  payload?: unknown,               // Optional, any JSON-serializable data
  __id?: string,                   // Optional, max 100 characters
  __bypassAccessControl?: boolean, // Optional
  __immediate?: boolean,           // Optional
  __startsThunk?: boolean,         // Optional
  __sourceWindowId?: number,       // Optional (added by framework)
}
```

The schema uses `.strict()` — unknown properties are rejected.

### Batch Limits

| Field | Limit |
|-------|-------|
| `type` | 1-200 chars |
| `__id`, `parentId`, `batchId` | Max 100 chars |
| Actions per batch | 1-200 |

### Examples

```typescript
// Valid
dispatch({ type: 'INCREMENT' });
dispatch({ type: 'UPDATE_USER', payload: { id: 123, name: 'Alice' } });
dispatch({ type: 'FETCH_DATA', __id: 'fetch-123' });
dispatch('URGENT_ACTION', payload, { immediate: true });

// Invalid — will be rejected
dispatch({ type: 'x'.repeat(300) });          // type too long
dispatch({ payload: { data: 123 } });          // missing type
dispatch({ type: 'ACTION', unknownField: true }); // unknown property
dispatch({ type: 123 });                       // wrong type for type
```

## Renderer Validation

Configurable via environment variable:

```bash
ZUBRIDGE_RENDERER_VALIDATION=off    # No validation (default in production)
ZUBRIDGE_RENDERER_VALIDATION=warn   # Log warnings (default in development)
ZUBRIDGE_RENDERER_VALIDATION=error  # Throw errors (recommended for CI)
```

In `warn` mode, invalid actions log to the console but don't break the app. In `error` mode, they throw immediately — useful for catching issues in test suites:

```json
{
  "scripts": {
    "test": "ZUBRIDGE_RENDERER_VALIDATION=error vitest"
  }
}
```

## Common Errors

| Error | Fix |
|-------|-----|
| `type: Required` | Add `type` property to action |
| `type: String must contain at most 200 character(s)` | Shorten action type name |
| `type: Expected string, received number` | Use string for action type |
| `parentId: String must contain at most 100 character(s)` | Use shorter thunk identifiers |
| `actions: Array must contain at most 200 element(s)` | Split into smaller batches |
| `Unrecognized key(s) in object` | Remove extra properties — use `payload` for custom data |

## Troubleshooting

**Validation passes in renderer but fails in main** — This shouldn't happen since both use identical schemas. Check that renderer validation isn't set to `off`.

**Too many warnings in development** — Fix the invalid actions, or temporarily set `ZUBRIDGE_RENDERER_VALIDATION=off` while you work through them.

**Tests failing with validation errors** — The validation caught real issues. Fix the actions, or use `off` mode if you're intentionally testing invalid actions.

## Related Documentation

- [Migration Guide v2 → v3](./migration/v2-to-v3.md) - Breaking changes including strict validation
- [Performance](./performance.md) - Action batching configuration and limits
- [Troubleshooting](./troubleshooting.md) - General troubleshooting guide
