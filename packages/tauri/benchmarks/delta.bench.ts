import { bench, describe } from 'vitest';
import { DeltaMerger } from '../src/deltas/DeltaMerger.js';

/**
 * Tauri-side delta benchmarks.
 *
 * The DeltaCalculator lives in Rust (packages/tauri-plugin/src/core/delta.rs)
 * because state diffing happens before the wire payload is built. The
 * renderer only needs the DeltaMerger to apply the incoming delta to its
 * local replica, which is the hot path measured here.
 */

interface TestState {
  counter: number;
  user: {
    name: string;
    profile: {
      theme: string;
    };
  };
  items: string[];
  [key: string]: unknown;
}

function createSmallState(): TestState {
  return {
    counter: 42,
    theme: 'dark',
    user: { name: 'Alice', profile: { theme: 'dark' } },
    items: [],
  };
}

function createMediumState() {
  const items: string[] = [];
  for (let i = 0; i < 100; i++) {
    items.push(`Item ${i}`);
  }
  return {
    counter: 42,
    theme: 'dark',
    user: { name: 'Alice', profile: { theme: 'dark' } },
    items,
    settings: { notifications: true, volume: 80, display: { resolution: '1080p', refresh: 60 } },
  };
}

function createLargeState(): TestState {
  const collections: Record<string, unknown> = {};
  for (let c = 0; c < 20; c++) {
    const items: string[] = [];
    for (let i = 0; i < 50; i++) {
      items.push(`Collection ${c} Item ${i}`);
    }
    collections[`collection${c}`] = { items, meta: { count: 50, name: `Col ${c}` } };
  }
  return {
    counter: 42,
    theme: 'dark',
    user: { name: 'Alice', profile: { theme: 'dark' } },
    items: [],
    ...collections,
  };
}

describe('DeltaMerger - single key change', () => {
  const merger = new DeltaMerger<TestState>();

  bench('small state', () => {
    const state = createSmallState();
    merger.merge(state, { type: 'delta', changed: { counter: 43 } });
  });

  bench('medium state', () => {
    const state = createMediumState();
    merger.merge(state, { type: 'delta', changed: { counter: 43 } });
  });

  bench('large state', () => {
    const state = createLargeState();
    merger.merge(state, { type: 'delta', changed: { counter: 43 } });
  });
});

describe('DeltaMerger - deep path changes', () => {
  const merger = new DeltaMerger<TestState>();

  bench('single deep path', () => {
    const state = createSmallState();
    merger.merge(state, { type: 'delta', changed: { 'user.profile.theme': 'light' } });
  });

  bench('multiple deep paths', () => {
    const state = createMediumState();
    merger.merge(state, {
      type: 'delta',
      changed: {
        'user.profile.theme': 'light',
        'settings.display.resolution': '4k',
        'settings.volume': 90,
      },
    });
  });

  bench('large state - deep collection path', () => {
    const state = createLargeState();
    merger.merge(state, {
      type: 'delta',
      changed: { 'collection0.meta.count': 51 },
    });
  });
});

describe('DeltaMerger - changed + removed', () => {
  const merger = new DeltaMerger<TestState>();

  bench('change one key, remove another', () => {
    const state = createMediumState();
    merger.merge(state, {
      type: 'delta',
      changed: { counter: 43 },
      removed: ['theme'],
    });
  });

  bench('overlapping paths: change and remove under same parent', () => {
    const state = createMediumState();
    merger.merge(state, {
      type: 'delta',
      changed: { 'settings.display.resolution': '4k' },
      removed: ['settings.display.refresh'],
    });
  });
});

describe('DeltaMerger - full state replacement vs delta merge', () => {
  const merger = new DeltaMerger<TestState>();

  bench('full state replacement (large)', () => {
    const state = createLargeState();
    const fullState = { ...state, counter: 43 };
    merger.merge(state, { type: 'full', fullState });
  });

  bench('delta merge - single key (large)', () => {
    const state = createLargeState();
    merger.merge(state, { type: 'delta', changed: { counter: 43 } });
  });

  bench('delta merge - 5 keys (large)', () => {
    const state = createLargeState();
    merger.merge(state, {
      type: 'delta',
      changed: {
        counter: 43,
        theme: 'light',
        'user.name': 'Bob',
        'user.profile.theme': 'light',
        'collection0.meta.name': 'Updated',
      },
    });
  });
});

describe('DeltaMerger - many changes (stress)', () => {
  const merger = new DeltaMerger<TestState>();

  bench('20 top-level key changes on large state', () => {
    const state = createLargeState();
    const changed: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      changed[`collection${i}`] = {
        items: [`updated-item-${i}`],
        meta: { count: 1, name: `Updated ${i}` },
      };
    }
    merger.merge(state, { type: 'delta', changed });
  });

  bench('20 deep path changes on large state', () => {
    const state = createLargeState();
    const changed: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      changed[`collection${i}.meta.name`] = `Updated ${i}`;
    }
    merger.merge(state, { type: 'delta', changed });
  });
});

describe('Delta payload size (renderer applies these)', () => {
  bench('full state payload (medium)', () => {
    const fullState = createMediumState();
    JSON.stringify(fullState);
  });

  bench('delta payload (medium) - single key', () => {
    JSON.stringify({ changed: { counter: 43 } });
  });

  bench('full state payload (large)', () => {
    JSON.stringify(createLargeState());
  });

  bench('delta payload (large) - single key', () => {
    JSON.stringify({ changed: { counter: 43 } });
  });
});
