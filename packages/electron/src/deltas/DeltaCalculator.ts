import { debug } from '@zubridge/core';
import { dequal } from 'dequal';
import { deepGet } from '../utils/deepGet.js';

export interface Delta<S> {
  type: 'delta' | 'full';
  version: number;
  changed?: Record<string, unknown>;
  fullState?: Partial<S>;
}

export class DeltaCalculator<S> {
  calculate(prev: S | undefined, next: S, keys?: string[]): Delta<S> {
    const normalized = this.normalizeKeys(keys);

    if (normalized === '*') {
      return {
        type: 'full',
        version: 1,
        fullState: next as Partial<S>,
      };
    }

    if (prev === undefined) {
      return {
        type: 'full',
        version: 1,
        fullState: this.getPartialState(next, keys),
      };
    }

    const changed: Record<string, unknown> = {};

    for (const key of normalized) {
      const prevValue = deepGet(prev as Record<string, unknown>, key);
      const nextValue = deepGet(next as Record<string, unknown>, key);

      if (!dequal(prevValue, nextValue)) {
        changed[key] = nextValue;
      }
    }

    if (Object.keys(changed).length === 0) {
      return {
        type: 'full',
        version: 1,
        fullState: {} as Partial<S>,
      };
    }

    return {
      type: 'delta',
      version: 1,
      changed,
    };
  }

  private normalizeKeys(keys?: string[]): string[] | '*' {
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

  private getPartialState(state: S, keys?: string[]): Partial<S> {
    const normalized = this.normalizeKeys(keys);
    if (normalized === '*') return { ...state };
    if (normalized.length === 0) return {};

    const result: Partial<S> = {};
    for (const key of normalized) {
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
      if (!curr[keys[i]]) curr[keys[i]] = {};
      curr = curr[keys[i]] as Record<string, unknown>;
    }
    curr[keys[keys.length - 1]] = value;
  }
}
