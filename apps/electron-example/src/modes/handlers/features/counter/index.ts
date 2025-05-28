import type { StoreApi } from 'zustand';
import type { BaseState } from '../../../../types.js';

/**
 * Creates a handler function for incrementing the counter
 */
export const incrementCounter =
  <S extends BaseState>(store: StoreApi<S>) =>
  () => {
    console.log('[Basic] Incrementing counter');
    store.setState((state) => ({
      ...state,
      counter: (state.counter || 0) + 1,
    }));
  };

/**
 * Creates a handler function for decrementing the counter
 */
export const decrementCounter =
  <S extends BaseState>(store: StoreApi<S>) =>
  () => {
    console.log('[Basic] Decrementing counter');
    store.setState((state) => ({
      ...state,
      counter: (state.counter || 0) - 1,
    }));
  };

/**
 * Creates a handler function for setting the counter
 */
export const setCounter =
  <S extends BaseState>(store: StoreApi<S>) =>
  (value: number) => {
    console.log('[Basic] Setting counter to:', value);
    store.setState((state) => ({
      ...state,
      counter: value,
    }));
  };

/**
 * Creates a handler function for setting the counter with a delay
 */
export const setCounterSlow =
  <S extends BaseState>(store: StoreApi<S>) =>
  async (value: number) => {
    console.log('[Basic] Setting counter (slow) to:', value);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    store.setState((state) => ({
      ...state,
      counter: value,
    }));
  };
