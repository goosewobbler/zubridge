import { type StoreApi } from 'zustand';
import type { AnyState } from '@zubridge/types';
import { initialState, generateTestState } from '@zubridge/apps-shared';

let store: StoreApi<AnyState>;

export const init = (s: StoreApi<AnyState>) => {
  store = s;
};

export const reset = () => {
  console.log('[Custom] Resetting state to defaults');
  store.setState(() => initialState as unknown as AnyState);
};

export const generateLargeState = async (options?: {
  variant?: 'small' | 'medium' | 'large' | 'xl';
}) => {
  const variant = options?.variant || 'medium';
  console.log(`[Custom] Generating ${variant} test state`);

  // Use the shared generateTestState function
  const filler = generateTestState(variant);

  store.setState((state) => ({
    ...state,
    filler,
  }));

  console.log(`[Custom] ${variant} test state generated (${filler.meta.estimatedSize})`);
};
