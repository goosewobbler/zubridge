import { useDispatch } from '@zubridge/electron';

import { useStore } from './hooks/useStore.js';
import type { State } from '../features/index.js';

export const App = () => {
  const counter = useStore((x: State) => x.counter);
  const dispatch = useDispatch(window.zubridge);

  return (
    <main>
      <button type="button" onClick={() => dispatch('COUNTER:DECREMENT')}>
        decrement
      </button>
      <pre>{counter ?? 'loading...'}</pre>
      <button type="button" onClick={() => dispatch('COUNTER:INCREMENT')}>
        increment
      </button>
    </main>
  );
};
