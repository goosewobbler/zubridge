import { bench, describe } from 'vitest';
import { DeltaCalculator } from '../src/deltas/DeltaCalculator.js';
import { DeltaMerger } from '../src/deltas/DeltaMerger.js';

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

describe('DeltaCalculator', () => {
  const calculator = new DeltaCalculator<TestState>();

  bench('small state - single key change', () => {
    const prev = createSmallState();
    const next = { ...prev, counter: 43 };
    calculator.calculate(prev, next, ['counter']);
  });

  bench('small state - deep key change', () => {
    const prev = createSmallState();
    const next = { ...prev, user: { ...prev.user, profile: { theme: 'light' } } };
    calculator.calculate(prev, next, ['user.profile.theme']);
  });

  bench('small state - multiple key changes', () => {
    const prev = createSmallState();
    const next = { ...prev, counter: 43, theme: 'light' };
    calculator.calculate(prev, next, ['counter', 'theme']);
  });

  bench('medium state - single key change', () => {
    const prev = createMediumState();
    const next = { ...prev, counter: 43 };
    calculator.calculate(prev, next, ['counter']);
  });

  bench('medium state - array change', () => {
    const prev = createMediumState();
    const next = { ...prev, items: [...prev.items, 'new item'] };
    calculator.calculate(prev, next, ['items']);
  });

  bench('large state - single key change', () => {
    const prev = createLargeState();
    const next = { ...prev, counter: 43 };
    calculator.calculate(prev, next, ['counter']);
  });

  bench('large state - deep key change', () => {
    const prev = createLargeState();
    const next = { ...prev, user: { ...prev.user, profile: { theme: 'light' } } };
    calculator.calculate(prev, next, ['user.profile.theme']);
  });

  bench('large state - collection change', () => {
    const prev = createLargeState();
    const next = {
      ...prev,
      collection0: {
        items: [...(prev.collection0 as { items: string[] }).items, 'new'],
        meta: { count: 51, name: 'Col 0' },
      },
    };
    calculator.calculate(prev, next, ['collection0']);
  });
});

describe('Delta payload size comparison', () => {
  const calculator = new DeltaCalculator<TestState>();

  bench('full state payload (medium)', () => {
    const prev = createMediumState();
    const fullState = {
      counter: 43,
      theme: 'dark',
      user: prev.user,
      items: prev.items,
      settings: prev.settings,
    };
    JSON.stringify(fullState);
  });

  bench('delta payload (medium) - single key', () => {
    const prev = createMediumState();
    const next = { ...prev, counter: 43 };
    const delta = calculator.calculate(prev, next, ['counter']);
    JSON.stringify(delta);
  });

  bench('full state payload (large)', () => {
    const prev = createLargeState();
    const fullState = { ...prev, counter: 43 };
    JSON.stringify(fullState);
  });

  bench('delta payload (large) - single key', () => {
    const prev = createLargeState();
    const next = { ...prev, counter: 43 };
    const delta = calculator.calculate(prev, next, ['counter']);
    JSON.stringify(delta);
  });

  bench('delta payload (medium) - deep key', () => {
    const prev = createMediumState();
    const next = { ...prev, settings: { ...prev.settings, volume: 90 } };
    const delta = calculator.calculate(prev, next, ['settings.volume']);
    JSON.stringify(delta);
  });

  bench('full state payload (large) - multi key', () => {
    const prev = createLargeState();
    const fullState = { ...prev, counter: 43, theme: 'light' };
    JSON.stringify(fullState);
  });

  bench('delta payload (large) - multi key', () => {
    const prev = createLargeState();
    const next = { ...prev, counter: 43, theme: 'light' };
    const delta = calculator.calculate(prev, next, ['counter', 'theme']);
    JSON.stringify(delta);
  });
});

// --- DeltaMerger benchmarks (renderer-side hot path) ---

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
