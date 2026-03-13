import { bench, describe } from 'vitest';
import { DeltaCalculator } from '../src/deltas/DeltaCalculator.js';

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

function createSmallState() {
  return {
    counter: 42,
    theme: 'dark',
    user: { name: 'Alice', profile: { theme: 'dark' } },
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

function createLargeState() {
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

  bench('delta payload (medium) - single key', () => {
    const prev = createMediumState();
    const next = { ...prev, counter: 43 };
    const delta = calculator.calculate(prev, next, ['counter']);
    JSON.stringify(delta);
  });

  bench('full state payload (large)', () => {
    const prev = createLargeState();
    const next = { ...prev, counter: 43 };
    const fullState = { ...next };
    JSON.stringify(fullState);
  });

  bench('delta payload (large) - single key', () => {
    const prev = createLargeState();
    const next = { ...prev, counter: 43 };
    const delta = calculator.calculate(prev, next, ['counter']);
    JSON.stringify(delta);
  });
});
