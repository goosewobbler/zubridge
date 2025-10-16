import type { State } from '../../features/index.js';

/**
 * Hook to access the Zubridge store in the renderer process
 */
export const useStore = () => {
  // Access the store through the window.zubridge object
  return (window as { zubridge?: { useStore?: () => State } }).zubridge?.useStore?.() as
    | State
    | undefined;
};
