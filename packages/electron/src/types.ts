import type { AnyState, Handlers } from '@zubridge/types';

// Re-export all types from the shared types package
export * from '@zubridge/types';

// Add any electron-specific types here
export type PreloadZustandBridgeReturn<S extends AnyState> = {
  handlers: Handlers<S>;
};
