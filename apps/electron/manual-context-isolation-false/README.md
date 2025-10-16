# Manual Test App: contextIsolation: false

> ⚠️ **Security Warning**: This app intentionally uses `contextIsolation: false`, a **security anti-pattern**. This configuration should **NOT** be used in new production applications.

This manual test app validates that Zubridge works correctly when Electron's context isolation is disabled - a legacy configuration required by some older applications that cannot be easily migrated.

## What This Tests

This app verifies that when `contextIsolation: false`:

1. **Preload Detection** - The preload script correctly detects `!process.contextIsolated`
2. **Window Assignment** - `__zubridge_subscriptionValidator` is attached to `window` instead of using `contextBridge`
3. **Full Functionality** - All Zubridge features work identically to the standard configuration:
   - State subscriptions across windows
   - Action dispatching
   - State updates and synchronization
4. **User Visibility** - A warning banner clearly indicates the non-standard configuration

## Quick Start

```bash
# From repo root - install dependencies
pnpm install

# Build packages
pnpm build:packages

# Run the test app
cd apps/electron/manual-context-isolation-false
pnpm dev
```

Two windows will open side-by-side with a yellow warning banner indicating context isolation is disabled.

## Testing Checklist

### ✅ Visual Indicators
- [ ] Yellow warning banner displays: "contextIsolation: ❌ Disabled"
- [ ] Banner shows: `__zubridge_subscriptionValidator on window: ✅ Yes`
- [ ] Security warning text is visible

### ✅ State Management
- [ ] Counter increments/decrements correctly
- [ ] Theme toggle switches between light/dark
- [ ] Both windows receive state updates simultaneously
- [ ] No errors in DevTools console

### ✅ Developer Console Checks

Open DevTools (Cmd+Option+I / Ctrl+Shift+I) and verify:

```javascript
// Validator should be accessible on window (not contextBridge)
window.__zubridge_subscriptionValidator
// → Should return object with stateKeyExists function

// Test the validator
window.__zubridge_subscriptionValidator.stateKeyExists('counter')
// → Should return true

window.__zubridge_subscriptionValidator.stateKeyExists('nonexistent')
// → Should return false
```

### ✅ No Errors
- [ ] No console errors about missing `contextBridge`
- [ ] No warnings about unsafe property access
- [ ] App runs without crashes

## Documentation

For more information about using Zubridge with `contextIsolation: false`:

- **Getting Started Guide** - See the [Context Isolation Disabled](../../../packages/electron/docs/getting-started.md#context-isolation-disabled) section for setup instructions and security considerations
- **Security Best Practices** - Read [Electron's Context Isolation Documentation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) to understand the risks

## Why This Exists

This app is **not** a recommended example - it's a reference implementation for an edge case. Most applications should use the default `contextIsolation: true` configuration for security.

This exists because:
- Some legacy applications genuinely cannot enable context isolation without extensive refactoring
- Zubridge officially supports this configuration for compatibility
- Having a working reference helps validate the feature and assists users with legacy constraints
