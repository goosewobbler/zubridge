# Minimal Zustand + Immer Example

This is a manual testing app for verifying Zubridge compatibility with [Immer](https://immerjs.github.io/immer/) using the standard Zustand middleware approach.

## What This Tests

This app demonstrates that Zubridge correctly handles state updates made with Zustand's Immer middleware:

- **Immer middleware**: Uses the standard `immer()` middleware from `zustand/middleware/immer`
- **Mutable syntax**: Write `state.counter += 1` instead of spreads
- **Frozen objects**: Immer freezes state in production mode
- **Structural sharing**: Unchanged parts of state maintain object references
- **IPC serialization**: Verifies frozen Immer state serializes correctly across processes

## Key Differences from minimal-zustand-basic

**Store creation with middleware:**
```typescript
import { immer } from 'zustand/middleware/immer';

const store = create<State>()(immer(() => initialState));
```

**Action handlers with mutable syntax:**

**minimal-zustand-basic (spreads):**
```typescript
store.setState((state) => ({
  ...state,
  counter: state.counter + 1,
}));
```

**minimal-zustand-immer (mutable):**
```typescript
store.setState((state) => {
  state.counter += 1; // Direct mutation, Immer handles immutability
});
```

## Running the App

```bash
pnpm dev
```

## Manual Testing Checklist

- [ ] Counter increment/decrement works
- [ ] Theme toggle works
- [ ] State syncs between windows
- [ ] No console errors about frozen objects
- [ ] No serialization errors in IPC
- [ ] Multiple windows stay in sync
- [ ] Check console for `[Immer]` log messages

## Expected Behavior

All features should work identically to `minimal-zustand-basic`. If any differences are observed, that indicates a compatibility issue with Immer middleware.

## See Also

- Unit tests: `packages/electron/test/integration/immer.spec.ts`
- Zustand Immer docs: https://zustand.docs.pmnd.rs/integrations/immer-middleware
- Immer docs: https://immerjs.github.io/immer/
