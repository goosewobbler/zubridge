import { useStore, type StoreApi } from 'zustand';
import { createStore as createZustandStore } from 'zustand/vanilla';
import type { AnyState, Handlers, Action, Thunk, ExtractState, ReadonlyStoreApi, DispatchFunc } from '@zubridge/types';

let store: StoreApi<AnyState>;

export const createStore = <S extends AnyState>(bridge: Handlers<S>): StoreApi<S> => {
  store = createZustandStore<Partial<S>>((setState: StoreApi<S>['setState']) => {
    // subscribe to changes
    bridge.subscribe((state) => setState(state));

    // get initial state
    bridge.getState().then((state) => setState(state));

    // no state keys - they will all come from main
    return {};
  });

  return store as StoreApi<S>;
};

type UseBoundStore<S extends ReadonlyStoreApi<unknown>> = {
  (): ExtractState<S>;
  <U>(selector: (state: ExtractState<S>) => U): U;
} & S;

export const createUseStore = <S extends AnyState>(bridge: Handlers<S>): UseBoundStore<StoreApi<S>> => {
  const vanillaStore = createStore<S>(bridge);
  const useBoundStore = (selector: (state: S) => unknown) => useStore(vanillaStore, selector);

  Object.assign(useBoundStore, vanillaStore);

  // return store hook
  return useBoundStore as UseBoundStore<StoreApi<S>>;
};

export const useDispatch =
  <S extends AnyState>(bridge: Handlers<S>): DispatchFunc<S> =>
  (action: Thunk<S> | Action | string, payload?: unknown): unknown => {
    if (typeof action === 'function') {
      // passed a function / thunk - so we execute the action, pass dispatch & store getState into it
      const typedStore = store as StoreApi<S>;
      return action(typedStore.getState, bridge.dispatch);
    }

    // passed action type and payload separately
    if (typeof action === 'string') {
      return bridge.dispatch(action, payload);
    }

    // passed an action
    return bridge.dispatch(action);
  };
