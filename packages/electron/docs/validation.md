# Validation

Zubridge validates all actions at both the renderer and main process levels to provide security and improved developer experience.

## Overview

Zubridge uses a **defense-in-depth** validation approach:

```
┌─────────────────────────────────────┐
│ Renderer Process (Untrusted)        │
│ ┌─────────────────────────────────┐ │
│ │ Renderer Validation (Dev Only)  │ │
│ │ • Purpose: Developer experience │ │
│ │ • Default: warn mode (v3.0+)    │ │
│ │ • Overhead: Zero in production  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
              ↓ IPC
┌─────────────────────────────────────┐
│ Main Process (Trusted)               │
│ ┌─────────────────────────────────┐ │
│ │ Main Validation (Always On)     │ │
│ │ • Purpose: Security boundary    │ │
│ │ • Always: validates all inputs  │ │
│ │ • Protection: DoS, injection    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Key Principles:**
- **Main validation is mandatory** - Security boundary, always validates
- **Renderer validation is optional** - Developer experience, configurable
- **Same schemas, different purposes** - Both use identical Zod validation
- **Never trust the client** - Renderer validation can be bypassed by malicious code

## Validation Rules

All actions must conform to this structure:

```typescript
{
  type: string,           // Required, 1-200 characters
  payload?: unknown,      // Optional, any JSON-serializable data
  __id?: string,          // Optional, max 100 characters
  __bypassAccessControl?: boolean,  // Optional
  immediate?: boolean,    // Optional (v3.0: renamed from __bypassThunkLock)
  __sourceWindowId?: number  // Optional (added by framework)
}
```

### Limits

| Field | Validation | Reason |
|-------|-----------|---------|
| `type` | String, 1-200 chars | Prevent DoS via huge type names |
| `__id` | String, max 100 chars | Reasonable identifier length |
| `parentId` | String, max 100 chars | Thunk ID limit |
| `batchId` | String, 1-100 chars | Batch identifier limit |
| Actions per batch | 1-200 actions | DoS protection (4x normal batch size) |

**Why 200 actions max?**
- Normal operation: ~50 actions/batch (ActionBatcher default)
- ActionBatcher queue: 200 max (proven safe in production)
- Hard security cap: 200 (4x safety margin, consistent architecture)
- See [batching performance docs](./performance.md#batching) for details

## Renderer Validation (v3.0+)

### Purpose

Catch bugs **before** they reach the main process:
- ✅ Immediate feedback in DevTools console
- ✅ Better error messages (Zod validation details)
- ✅ Faster debugging (error where action is dispatched)
- ✅ Zero production overhead (stripped from builds)

### Default Behavior

**Development (NODE_ENV==='development')**
```bash
# Default: warn mode
npm start
# Invalid actions log warnings but don't break the app
```

**Production (NODE_ENV==='production')**
```bash
# Default: off (zero overhead)
npm run build
# No validation overhead in production builds
```

### Configuration

Set validation level via environment variable:

```bash
# Disable (not recommended for development)
ZUBRIDGE_RENDERER_VALIDATION=off

# Log warnings (default in development)
ZUBRIDGE_RENDERER_VALIDATION=warn

# Throw errors (recommended for CI/testing)
ZUBRIDGE_RENDERER_VALIDATION=error
```

### Validation Levels

#### 'off' - No Validation
- No validation overhead
- No console output
- Not recommended for development

#### 'warn' - Warnings Only (Default in Dev)
```typescript
dispatch({ type: 'x'.repeat(300) });

// Console output:
// ⚠️ [Zubridge] Invalid action dispatch: action.type: String must contain at most 200 character(s)
// {
//   action: { type: 'xxx...' },
//   error: 'action.type: String must contain at most 200 character(s)',
//   validationDetails: { ... }
// }
```

✅ **Best for development:**
- Non-blocking (app keeps working)
- Helpful feedback
- Discovers issues without forcing fixes

#### 'error' - Strict Mode
```typescript
dispatch({ type: 'x'.repeat(300) });
// ❌ Throws: Error: [Zubridge] Invalid action dispatch: ...
```

✅ **Best for CI/testing:**
- Catches issues immediately
- Fails fast on invalid actions
- Ensures code quality before merge

### Examples

```json
{
  "scripts": {
    "dev": "NODE_ENV=development npm start",
    "test": "ZUBRIDGE_RENDERER_VALIDATION=error vitest",
    "build": "NODE_ENV=production npm run build"
  }
}
```

## Main Validation (Always On)

### Purpose

**Security boundary** - validate all inputs from untrusted renderers:
- 🛡️ Prevent DoS attacks (oversized batches, huge strings)
- 🛡️ Prevent injection attacks (malformed payloads)
- 🛡️ Enforce action structure (type safety at runtime)
- 🛡️ Protect against compromised renderers

### Implementation

Main process uses the same Zod schemas for validation:

```typescript
// Main process always validates
const result = validateSingleDispatch(data);

if (!result.success) {
  // Send error response to renderer
  sendError(result.error);
  return;
}

// Process validated action
processAction(result.data);
```

### What Gets Validated

**Single Actions (`handleDispatch`):**
```typescript
validateSingleDispatch({
  action: { type: 'ACTION', payload: {...} },
  parentId?: 'optional-thunk-id'
})
```

**Batch Actions (`handleBatchDispatch`):**
```typescript
validateBatchDispatch({
  batchId: 'batch-uuid',
  actions: [
    { action: { type: 'ACTION_1' }, id: 'id-1' },
    { action: { type: 'ACTION_2' }, id: 'id-2', parentId: 'thunk-id' }
  ]
})
```

### Error Handling

Invalid actions are rejected with detailed error messages:

```typescript
// Renderer receives error acknowledgment
{
  actionId: 'action-123',
  error: 'Validation failed: action.type: String must contain at most 200 character(s)',
  thunkState: { version: 0, thunks: [] }
}
```

## Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `type: Required` | Missing `type` field | Add `type` property to action |
| `type: String must contain at most 200 character(s)` | Action type too long | Shorten action type name |
| `type: Expected string, received number` | Wrong type for `type` field | Use string for action type |
| `parentId: String must contain at most 100 character(s)` | Thunk ID too long | Use shorter thunk identifiers |
| `actions: Array must contain at least 1 element(s)` | Empty batch | Include at least one action in batch |
| `actions: Array must contain at most 200 element(s)` | Batch too large | Split into multiple smaller batches |
| `Unrecognized key(s) in object` | Unknown property | Remove extra properties from action |

## Migration Guide (v2.x → v3.0)

### Breaking Change: Renderer Validation Enabled by Default

In v3.0, renderer validation is **enabled in development** (warn mode).

**What you'll see:**
```typescript
// This worked silently in v2.x
dispatch({ type: 'REALLY_LONG_TYPE_NAME'.repeat(50) });

// In v3.0 development, you'll see:
// ⚠️ [Zubridge] Invalid action dispatch: action.type: String must contain at most 200 character(s)
```

### Migration Options

**Option 1: Fix invalid actions (Recommended)**
```typescript
// Before (invalid)
dispatch({ type: 'x'.repeat(300) });

// After (valid)
dispatch({ type: 'SHORTENED_TYPE' });
```

**Option 2: Disable temporarily**
```bash
# While you fix issues
ZUBRIDGE_RENDERER_VALIDATION=off npm start
```

**Option 3: Use warn mode and fix gradually**
```bash
# Default - see warnings, app keeps working
npm start
```

### Renamed Flag

```typescript
// v2.x
dispatch({ type: 'ACTION', __bypassThunkLock: true });

// v3.0
dispatch({ type: 'ACTION', immediate: true });
```

## Technical Details

### Implementation

Both renderer and main validation use shared Zod schemas:

```typescript
// packages/electron/src/bridge/ipc/validation.ts
import { z } from 'zod';

export const ActionPayloadSchema = z.object({
  type: z.string().min(1).max(200),
  payload: z.unknown().optional(),
  __id: z.string().max(100).optional(),
  __bypassAccessControl: z.boolean().optional(),
  immediate: z.boolean().optional(),
  __sourceWindowId: z.number().optional(),
}).strict(); // Rejects unknown properties

export const BatchDispatchPayloadSchema = z.object({
  batchId: z.string().min(1).max(100),
  actions: z.array(BatchActionItemSchema).min(1).max(200),
}).strict();
```

### Performance

**Renderer validation:**
- Development: ~0.1ms per action (negligible)
- Production: 0ms (completely tree-shaken)
- Bundle size: +12KB in dev (Zod), 0KB in production

**Main validation:**
- Always on: ~0.1ms per action
- Required for security (cannot be disabled)
- Minimal overhead for critical protection

### Type Safety

Zod provides automatic TypeScript type inference:

```typescript
const result = validateSingleDispatch(data);

if (result.success) {
  // TypeScript knows result.data is ValidatedSingleDispatch
  const { action, parentId } = result.data;
} else {
  // TypeScript knows result.error is string
  console.error(result.error);
}
```

## Best Practices

### Development

1. ✅ Use **'warn' mode** (default) for active development
2. ✅ Fix validation warnings promptly
3. ✅ Don't ignore warnings - they indicate real issues
4. ✅ Test with **'error' mode** before committing

### CI/Testing

1. ✅ Use **'error' mode** in test suites
2. ✅ Catch validation issues before they reach production
3. ✅ Add to CI pipeline:
   ```json
   {
     "scripts": {
       "test:ci": "ZUBRIDGE_RENDERER_VALIDATION=error npm test"
     }
   }
   ```

### Production

1. ✅ Validation is **automatically disabled** (NODE_ENV==='production')
2. ✅ Zero overhead in production builds
3. ✅ Main validation always runs (security)

### Action Design

1. ✅ Keep action types short and descriptive
2. ✅ Use action IDs for tracking, not huge strings
3. ✅ Avoid huge payloads - use references instead
4. ✅ Don't include sensitive data in actions (they're logged)

## Security Considerations

### Defense in Depth

```
Layer 1: Renderer Validation (Optional, Dev Experience)
         ↓ Can be bypassed by malicious code
Layer 2: Main Validation (Mandatory, Security)
         ↓ Always validates, cannot be bypassed
Layer 3: Action Processing
```

### Why Main Validation is Critical

**Renderer validation is NOT a security measure:**
- Can be bypassed by compromised/malicious code
- Only runs in development by default
- Purpose is developer experience, not security

**Main validation is the security boundary:**
- Always validates, regardless of environment
- Cannot be bypassed by renderer
- Protects against DoS and injection attacks
- Required for production security

### Attack Scenarios Protected

| Attack | Protection |
|--------|-----------|
| **DoS via oversized batches** | Max 200 actions/batch, reject larger |
| **DoS via huge strings** | Max 200 chars for type, 100 for IDs |
| **Injection via malformed payloads** | Strict Zod schemas, reject unknown fields |
| **Memory exhaustion** | ActionBatcher queue limit (200 max) |
| **Type coercion attacks** | Strict type checking (no coercion) |

## Troubleshooting

### Validation passes in renderer but fails in main

This shouldn't happen - both use identical Zod schemas. If you encounter this:
1. Check NODE_ENV - renderer validation might be 'off'
2. Verify same Zod version on both sides
3. Report as a bug if schemas diverge

### Too many validation warnings

Either:
1. Fix the invalid actions (recommended)
2. Use `ZUBRIDGE_RENDERER_VALIDATION=off` temporarily
3. Fix gradually while keeping warn mode

### Tests failing with validation errors

Good! This means validation caught real issues. Either:
1. Fix the invalid actions
2. Or intentionally use 'off' mode if testing invalid actions

### Production performance concerns

Renderer validation has **zero production overhead** - it's completely removed.
Main validation overhead is minimal (~0.1ms) and required for security.

## FAQ

### Can I disable main validation?

**No.** Main validation is a security requirement and cannot be disabled.

### Can I customize validation rules?

Not currently. Validation rules are designed for security and match both renderer and main process requirements. If you need custom validation, do it before calling `dispatch()`.

### Does TypeScript replace the need for validation?

**No.** TypeScript is compile-time only. Zod provides runtime validation which is necessary for:
- Catching bugs with `any` types
- Validating data from untrusted sources (renderer)
- Security (never trust client-side types)

### What about Redux/Zustand actions?

Zubridge validates the **action envelope**, not library-specific structure. Your Redux/Zustand actions are wrapped in a Zubridge envelope which is validated.

### Why strict mode (reject unknown properties)?

Security. Unknown properties could be:
- Injection attempts
- Typos that hide bugs
- Forward compatibility issues

Strict validation catches these early.

## Related Documentation

- [Performance & Batching](./performance.md) - Action batching and optimization
- [Thunk System](./thunks.md) - Async action handling
- [Security Review](./SECURITY_PERFORMANCE_REVIEW.md) - Security analysis
- [Migration Guide v3.0](./MIGRATION_V3.md) - Upgrading from v2.x

## Examples

### Valid Actions

```typescript
// Simple action
dispatch({ type: 'INCREMENT' });

// With payload
dispatch({
  type: 'UPDATE_USER',
  payload: { id: 123, name: 'Alice' }
});

// With tracking ID
dispatch({
  type: 'FETCH_DATA',
  __id: 'fetch-123'
});

// Immediate execution (bypass thunk lock)
dispatch({
  type: 'URGENT_ACTION',
  immediate: true
});
```

### Invalid Actions (Will be rejected)

```typescript
// Type too long
dispatch({ type: 'x'.repeat(300) }); // ❌

// Missing type
dispatch({ payload: { data: 123 } }); // ❌

// Unknown property
dispatch({ type: 'ACTION', unknownField: true }); // ❌

// Wrong type for type
dispatch({ type: 123 }); // ❌
```

### Development Workflow

```bash
# Development with warnings
npm run dev
# See validation warnings in console

# Fix issues

# Test with strict mode
ZUBRIDGE_RENDERER_VALIDATION=error npm test
# Ensure all actions are valid

# Commit
git commit -m "fix: resolve validation warnings"
```
