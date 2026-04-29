import type { BaseState as SharedBaseState } from '@zubridge/apps-shared';

/**
 * Base state for the Tauri e2e fixture. Mirrors the Electron e2e's
 * `BaseState` so the same renderer code drives both apps.
 */
export interface BaseState extends SharedBaseState {
  [key: string]: unknown;
}

export function isBaseState(state: unknown): state is BaseState {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  return typeof s.counter === 'number' && (s.theme === 'light' || s.theme === 'dark');
}

export type State = BaseState;
