import { bench, describe } from 'vitest';
import { getPartialState, SubscriptionManager } from '../src/subscription/SubscriptionManager.js';
import { sanitizeState } from '../src/utils/serialization.js';

// --- State fixtures at different sizes ---

function createSmallState() {
  return {
    counter: 42,
    theme: 'dark',
    user: { name: 'Alice', loggedIn: true },
  };
}

function createMediumState() {
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < 100; i++) {
    items.push({ id: i, label: `Item ${i}`, checked: i % 2 === 0, metadata: { priority: i % 5 } });
  }
  return {
    counter: 42,
    theme: 'dark',
    user: { name: 'Alice', loggedIn: true, preferences: { lang: 'en', timezone: 'UTC' } },
    items,
    settings: { notifications: true, volume: 80, display: { resolution: '1080p', refresh: 60 } },
  };
}

function createLargeState() {
  const collections: Record<string, unknown> = {};
  for (let c = 0; c < 20; c++) {
    const items: Record<string, unknown>[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: `${c}-${i}`,
        label: `Collection ${c} Item ${i}`,
        nested: { a: i, b: `val-${i}`, c: { deep: true, level: i % 3 } },
      });
    }
    collections[`collection${c}`] = { items, meta: { count: 50, name: `Col ${c}` } };
  }
  return {
    counter: 42,
    theme: 'dark',
    user: { name: 'Alice', loggedIn: true },
    ...collections,
  };
}

// --- getPartialState benchmarks ---

describe('getPartialState - small state (3 keys)', () => {
  const state = createSmallState();

  bench('full state (no keys)', () => {
    getPartialState(state);
  });

  bench('selective (1 key)', () => {
    getPartialState(state, ['counter']);
  });

  bench('selective (2 keys)', () => {
    getPartialState(state, ['counter', 'theme']);
  });
});

describe('getPartialState - medium state (~100 items)', () => {
  const state = createMediumState();

  bench('full state (no keys)', () => {
    getPartialState(state);
  });

  bench('selective (1 key)', () => {
    getPartialState(state, ['counter']);
  });

  bench('selective (2 keys)', () => {
    getPartialState(state, ['counter', 'settings']);
  });

  bench('selective (deep key)', () => {
    getPartialState(state, ['settings.display.resolution']);
  });
});

describe('getPartialState - large state (20 collections x 50 items)', () => {
  const state = createLargeState();

  bench('full state (no keys)', () => {
    getPartialState(state);
  });

  bench('selective (1 key)', () => {
    getPartialState(state, ['counter']);
  });

  bench('selective (3 keys)', () => {
    getPartialState(state, ['counter', 'theme', 'user']);
  });
});

// --- sanitizeState benchmarks ---

describe('sanitizeState - small state', () => {
  const state = createSmallState();
  const partial = getPartialState(state, ['counter']);

  bench('full state', () => {
    sanitizeState(state);
  });

  bench('partial state (1 key)', () => {
    sanitizeState(partial as Record<string, unknown>);
  });
});

describe('sanitizeState - medium state', () => {
  const state = createMediumState();
  const partial = getPartialState(state, ['counter', 'settings']);

  bench('full state', () => {
    sanitizeState(state);
  });

  bench('partial state (2 keys)', () => {
    sanitizeState(partial as Record<string, unknown>);
  });
});

describe('sanitizeState - large state', () => {
  const state = createLargeState();
  const partial = getPartialState(state, ['counter', 'theme', 'user']);

  bench('full state', () => {
    sanitizeState(state);
  });

  bench('partial state (3 keys)', () => {
    sanitizeState(partial as Record<string, unknown>);
  });
});

// --- Notify pipeline benchmarks (without serialization) ---

describe('notify pipeline (no serialization) - medium state, single subscriber', () => {
  const prev = createMediumState();
  const next = { ...prev, counter: 43 };
  const noop = () => {};

  bench('full state subscription', () => {
    const manager = new SubscriptionManager();
    manager.subscribe(undefined, noop, 1);
    manager.notify(prev, next);
  });

  bench('selective subscription (1 key)', () => {
    const manager = new SubscriptionManager();
    manager.subscribe(['counter'], noop, 1);
    manager.notify(prev, next);
  });

  bench('selective subscription (irrelevant change)', () => {
    const manager = new SubscriptionManager();
    manager.subscribe(['theme'], noop, 1);
    manager.notify(prev, next);
  });
});

// --- Realistic notify pipeline: notify + sanitizeState in callback ---
// This matches the real SubscriptionHandler code path where sanitizeState
// is called inside the subscription callback before sending via IPC.

describe('notify + sanitize pipeline - medium state, single subscriber', () => {
  const prev = createMediumState();
  const next = { ...prev, counter: 43 };

  bench('full state subscription', () => {
    const manager = new SubscriptionManager();
    manager.subscribe(
      undefined,
      (state) => {
        sanitizeState(state as Record<string, unknown>);
      },
      1,
    );
    manager.notify(prev, next);
  });

  bench('selective subscription (1 key)', () => {
    const manager = new SubscriptionManager();
    manager.subscribe(
      ['counter'],
      (state) => {
        sanitizeState(state as Record<string, unknown>);
      },
      1,
    );
    manager.notify(prev, next);
  });
});

describe('notify + sanitize pipeline - large state, single subscriber', () => {
  const prev = createLargeState();
  const next = { ...prev, counter: 43 };

  bench('full state subscription', () => {
    const manager = new SubscriptionManager();
    manager.subscribe(
      undefined,
      (state) => {
        sanitizeState(state as Record<string, unknown>);
      },
      1,
    );
    manager.notify(prev, next);
  });

  bench('selective subscription (1 key)', () => {
    const manager = new SubscriptionManager();
    manager.subscribe(
      ['counter'],
      (state) => {
        sanitizeState(state as Record<string, unknown>);
      },
      1,
    );
    manager.notify(prev, next);
  });
});

describe('notify + sanitize pipeline - large state, 5 subscribers', () => {
  const prev = createLargeState();
  const next = { ...prev, counter: 43 };

  bench('all full state subscriptions', () => {
    const manager = new SubscriptionManager();
    for (let i = 1; i <= 5; i++) {
      manager.subscribe(
        undefined,
        (state) => {
          sanitizeState(state as Record<string, unknown>);
        },
        i,
      );
    }
    manager.notify(prev, next);
  });

  bench('all selective subscriptions (1 key each)', () => {
    const manager = new SubscriptionManager();
    for (let i = 1; i <= 5; i++) {
      manager.subscribe(
        ['counter'],
        (state) => {
          sanitizeState(state as Record<string, unknown>);
        },
        i,
      );
    }
    manager.notify(prev, next);
  });

  bench('mixed: 3 full + 2 selective', () => {
    const manager = new SubscriptionManager();
    for (let i = 1; i <= 3; i++) {
      manager.subscribe(
        undefined,
        (state) => {
          sanitizeState(state as Record<string, unknown>);
        },
        i,
      );
    }
    manager.subscribe(
      ['counter'],
      (state) => {
        sanitizeState(state as Record<string, unknown>);
      },
      4,
    );
    manager.subscribe(
      ['theme'],
      (state) => {
        sanitizeState(state as Record<string, unknown>);
      },
      5,
    );
    manager.notify(prev, next);
  });
});
