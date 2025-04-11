import { createUseStore } from '@zubridge/electron';
import type { State } from '../../types/state';

// Create a shared store hook for the entire application
export const useStore = createUseStore<State>();
