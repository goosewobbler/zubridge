import { dequal } from 'dequal';

// `dequal` that remembers each result per object pair; only valid for objects never mutated.
export function createMemoizedDequal(): (a: unknown, b: unknown) => boolean {
  const results = new WeakMap<object, WeakMap<object, boolean>>();
  return (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return dequal(a, b);
    const row = results.get(a) ?? new WeakMap<object, boolean>();
    results.set(a, row);
    const cached = row.get(b);
    if (cached !== undefined) return cached;
    const equal = dequal(a, b);
    row.set(b, equal);
    return equal;
  };
}
