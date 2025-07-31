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

/**
 * Creates a handler function for doubling the counter with a delay
 */
export const doubleCounterSlow =
  <S extends BaseState>(store: StoreApi<S>) =>
  async () => {
    console.log('[Handlers] Doubling counter with delay');
    console.log(`[Handlers] Time before delay: ${new Date().toISOString()}`);

    // Use a longer delay on Linux to ensure proper sequence execution
    const delayTime = process.platform === 'linux' ? 5000 : 2500;
    console.log(`[Handlers] Using ${delayTime}ms delay on platform: ${process.platform}`);

    await new Promise((resolve) => setTimeout(resolve, delayTime));

    console.log(`[Handlers] Time after delay: ${new Date().toISOString()}`);
    store.setState((state) => {
      const newValue = (state.counter || 0) * 2;
      console.log(`[Handlers] Counter doubled from ${state.counter} to ${newValue}`);
      return {
        ...state,
        counter: newValue,
      };
    });
  };

/**
 * Creates a handler function for halving the counter with a delay
 */
export const halveCounterSlow =
  <S extends BaseState>(store: StoreApi<S>) =>
  async () => {
    console.log('[Handlers] Halving counter with delay');
    console.log(`[Handlers] Time before delay: ${new Date().toISOString()}`);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    console.log(`[Handlers] Time after delay: ${new Date().toISOString()}`);
    store.setState((state) => {
      const newValue = Math.round((state.counter || 0) / 2);
      console.log(`[Handlers] Counter halved from ${state.counter} to ${newValue}`);
      return {
        ...state,
        counter: newValue,
      };
    });
  };

/**
 * Creates a handler function for doubling the counter (no delay)
 */
export const doubleCounter =
  <S extends BaseState>(store: StoreApi<S>) =>
  () => {
    console.log('[Handlers] Doubling counter immediately');
    store.setState((state) => {
      const newValue = (state.counter || 0) * 2;
      console.log(`[Handlers] Counter doubled from ${state.counter} to ${newValue}`);
      return {
        ...state,
        counter: newValue,
      };
    });
  };

/**
 * Creates a handler function for halving the counter (no delay)
 */
export const halveCounter =
  <S extends BaseState>(store: StoreApi<S>) =>
  () => {
    console.log('[Handlers] Halving counter immediately');
    store.setState((state) => {
      const newValue = Math.round((state.counter || 0) / 2);
      console.log(`[Handlers] Counter halved from ${state.counter} to ${newValue}`);
      return {
        ...state,
        counter: newValue,
      };
    });
  };
