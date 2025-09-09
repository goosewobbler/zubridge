import type { StoreApi } from 'zustand';

/**
 * Creates a handler function for incrementing the counter
 */
export const incrementCounter =
  <S extends { counter?: number; [key: string]: unknown }>(store: StoreApi<S>) =>
  () => {
    console.log('[Handler] Incrementing counter');
    store.setState((state) => ({
      ...state,
      counter: (state.counter || 0) + 1,
    }));
  };

/**
 * Creates a handler function for decrementing the counter
 */
export const decrementCounter =
  <S extends { counter?: number; [key: string]: unknown }>(store: StoreApi<S>) =>
  () => {
    console.log('[Handler] Decrementing counter');
    store.setState((state) => ({
      ...state,
      counter: (state.counter || 0) - 1,
    }));
  };

/**
 * Creates a handler function for setting the counter
 */
export const setCounter =
  <S extends { counter?: number; [key: string]: unknown }>(store: StoreApi<S>) =>
  (value: number) => {
    console.log('[Handler] Setting counter to:', value);
    store.setState((state) => ({
      ...state,
      counter: value,
    }));
  };
