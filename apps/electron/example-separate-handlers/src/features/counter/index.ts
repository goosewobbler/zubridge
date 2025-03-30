import { type Store } from '..';

export const handlers = (store: Store) => ({
  'COUNTER:INCREMENT': () => store.setState((state) => ({ ...state, counter: state.counter + 1 })),
  'COUNTER:DECREMENT': () => store.setState((state) => ({ ...state, counter: state.counter - 1 })),
});
