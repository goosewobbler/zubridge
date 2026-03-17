import type { Delta } from './types.js';

export class DeltaMerger<S> {
  merge(currentState: S, delta: Delta<S>): Partial<S> {
    const hasChanges = delta.changed && Object.keys(delta.changed).length > 0;
    const hasRemovals = delta.removed && delta.removed.length > 0;

    if (delta.type === 'full' || (!hasChanges && !hasRemovals)) {
      // Guard against empty fullState ({}) which is truthy but should not replace current state
      if (delta.fullState && Object.keys(delta.fullState).length > 0) {
        // Return a defensive copy so callers can't mutate the IPC payload
        // and corrupt subsequent merge bases.
        return structuredClone(delta.fullState);
      }
      // Return a shallow clone for consistency — callers who assume merge()
      // always returns a fresh object should not receive the original reference.
      return { ...currentState } as Partial<S>;
    }

    const result = this.cloneWithStructuralSharing(currentState as Record<string, unknown>);

    if (delta.changed) {
      // Sort entries so parent paths ('user') are processed before child paths
      // ('user.name'). Structural sharing requires parents to be cloned first
      // so child writes target the already-cloned node.
      for (const [keyPath, value] of Object.entries(delta.changed).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        this.setDeepWithStructuralSharing(
          result,
          currentState as Record<string, unknown>,
          keyPath,
          value,
        );
      }
    }

    if (delta.removed) {
      for (const keyPath of delta.removed) {
        this.deleteDeep(result, currentState as Record<string, unknown>, keyPath);
      }
    }

    return result as Partial<S>;
  }

  private cloneWithStructuralSharing(obj: Record<string, unknown>): Record<string, unknown> {
    return { ...obj };
  }

  private setDeepWithStructuralSharing(
    result: Record<string, unknown>,
    original: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const keys = path.split('.');

    if (keys.length === 1) {
      // Clone the value before storing to avoid mutating the caller's state
      // when this key is later processed as a parent of another path
      result[keys[0]] = this.cloneValue(value);
      return;
    }

    const pathToParent = keys.slice(0, -1);
    const finalKey = keys[keys.length - 1];

    let current: Record<string, unknown> = result;
    let originalCurrent: Record<string, unknown> = original;

    for (let i = 0; i < pathToParent.length; i++) {
      const key = pathToParent[i];
      const existingInResult = current[key];
      const originalValue = originalCurrent[key] as Record<string, unknown> | undefined;

      if (
        existingInResult &&
        typeof existingInResult === 'object' &&
        existingInResult !== originalValue
      ) {
        // Already cloned by a prior call — reuse the in-progress clone
        current = existingInResult as Record<string, unknown>;
        originalCurrent = originalValue ?? (existingInResult as Record<string, unknown>);
      } else if (originalValue !== null && typeof originalValue === 'object') {
        const cloned = Array.isArray(originalValue) ? [...originalValue] : { ...originalValue };
        current[key] = cloned;
        current = cloned as Record<string, unknown>;
        originalCurrent = originalValue;
      } else {
        const newObj: Record<string, unknown> = {};
        current[key] = newObj;
        current = newObj;
        originalCurrent = newObj;
      }
    }

    current[finalKey] = this.cloneValue(value);
  }

  private cloneValue(value: unknown): unknown {
    if (value === null || value === undefined || typeof value !== 'object') {
      // Primitives are immutable — no cloning needed.
      return value;
    }
    // structuredClone is available in Electron 8+
    return structuredClone(value);
  }

  private deleteDeep(
    obj: Record<string, unknown>,
    original: Record<string, unknown>,
    path: string,
  ): void {
    const keys = path.split('.');

    if (keys.length === 1) {
      delete obj[keys[0]];
      return;
    }

    let current = obj;
    let originalCurrent = original;
    for (let i = 0; i < keys.length - 1; i++) {
      const next = current[keys[i]];
      if (next == null || typeof next !== 'object') return;
      const originalValue = originalCurrent[keys[i]] as Record<string, unknown> | undefined;

      if (next !== originalValue) {
        // Already cloned by setDeepWithStructuralSharing — reuse it
        current = next as Record<string, unknown>;
        originalCurrent = originalValue ?? (next as Record<string, unknown>);
      } else {
        const cloned = Array.isArray(next)
          ? [...(next as unknown[])]
          : { ...(next as Record<string, unknown>) };
        current[keys[i]] = cloned;
        current = cloned as Record<string, unknown>;
        originalCurrent = originalValue ?? (next as Record<string, unknown>);
      }
    }
    delete current[keys[keys.length - 1]];
  }
}
