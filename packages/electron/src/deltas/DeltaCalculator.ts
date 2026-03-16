import { dequal } from 'dequal';
import { deepGet } from '../utils/deepGet.js';
import type { Delta } from './types.js';

export type NormalizedKeys = string[] | '*';

export class DeltaCalculator<S> {
  normalizeKeys(keys?: string[]): NormalizedKeys {
    if (!keys) {
      return '*';
    }

    if (keys.length === 0) {
      return [];
    }

    if (keys.includes('*')) {
      return '*';
    }

    return [...new Set(keys.map((k) => k.trim()).filter((k) => k.length > 0))].sort();
  }

  calculate(prev: S | undefined, next: S, normalizedKeys: NormalizedKeys): Delta<S> | null {
    if (normalizedKeys === '*') {
      return this.calculateTopLevelDelta(prev, next);
    }

    if (prev === undefined) {
      return {
        type: 'full',
        fullState: this.getPartialState(next, normalizedKeys),
      };
    }

    const changed: Record<string, unknown> = {};
    const removed: string[] = [];

    for (const key of normalizedKeys) {
      const prevValue = deepGet(prev as Record<string, unknown>, key);
      const nextValue = deepGet(next as Record<string, unknown>, key);

      if (!dequal(prevValue, nextValue)) {
        if (nextValue === undefined && prevValue !== undefined) {
          removed.push(key);
        } else {
          changed[key] = nextValue;
        }
      }
    }

    const hasChanges = Object.keys(changed).length > 0;
    const hasRemovals = removed.length > 0;

    if (!hasChanges && !hasRemovals) {
      return null;
    }

    return {
      type: 'delta',
      changed: hasChanges ? changed : undefined,
      removed: hasRemovals ? removed : undefined,
    };
  }

  private calculateTopLevelDelta(prev: S | undefined, next: S): Delta<S> | null {
    if (prev === undefined) {
      return {
        type: 'full',
        fullState: next as Partial<S>,
      };
    }

    const prevObj = prev as Record<string, unknown>;
    const nextObj = next as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]);
    const changed: Record<string, unknown> = {};
    const removed: string[] = [];

    for (const key of allKeys) {
      if (!dequal(prevObj[key], nextObj[key])) {
        if (!(key in nextObj)) {
          removed.push(key);
        } else {
          changed[key] = nextObj[key];
        }
      }
    }

    const hasChanges = Object.keys(changed).length > 0;
    const hasRemovals = removed.length > 0;

    if (!hasChanges && !hasRemovals) {
      return null;
    }

    return {
      type: 'delta',
      changed: hasChanges ? changed : undefined,
      removed: hasRemovals ? removed : undefined,
    };
  }

  private getPartialState(state: S, normalizedKeys: NormalizedKeys): Partial<S> {
    if (normalizedKeys === '*') return { ...state };
    if (normalizedKeys.length === 0) return {};

    const result: Partial<S> = {};
    for (const key of normalizedKeys) {
      const value = deepGet(state as Record<string, unknown>, key);
      if (value !== undefined) {
        this.setDeep(result as Record<string, unknown>, key, value);
      }
    }
    return result;
  }

  private setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let curr = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (curr[keys[i]] == null || typeof curr[keys[i]] !== 'object') {
        curr[keys[i]] = {};
      } else {
        // Shallow-clone so later iterations don't traverse into (and mutate)
        // the source state when a parent path was stored as a live reference
        curr[keys[i]] = { ...(curr[keys[i]] as Record<string, unknown>) };
      }
      curr = curr[keys[i]] as Record<string, unknown>;
    }
    curr[keys[keys.length - 1]] = value;
  }
}
