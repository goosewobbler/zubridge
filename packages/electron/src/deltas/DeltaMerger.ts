export class DeltaMerger<S> {
  merge(
    currentState: S,
    delta: {
      type: 'delta' | 'full';
      changed?: Record<string, unknown>;
      removed?: string[];
      fullState?: Partial<S>;
    },
  ): Partial<S> {
    const hasChanges = delta.changed && Object.keys(delta.changed).length > 0;
    const hasRemovals = delta.removed && delta.removed.length > 0;

    if (delta.type === 'full' || (!hasChanges && !hasRemovals)) {
      // Guard against empty fullState ({}) which is truthy but should not replace current state
      if (delta.fullState && Object.keys(delta.fullState).length > 0) {
        return delta.fullState;
      }
      return currentState;
    }

    const result = this.cloneWithStructuralSharing(currentState as Record<string, unknown>);

    if (delta.changed) {
      for (const [keyPath, value] of Object.entries(delta.changed)) {
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
        this.deleteDeep(result, keyPath);
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
      result[keys[0]] = value;
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
      } else if (originalValue && typeof originalValue === 'object') {
        const cloned = { ...originalValue };
        current[key] = cloned;
        current = cloned;
        originalCurrent = originalValue;
      } else {
        const newObj: Record<string, unknown> = {};
        current[key] = newObj;
        current = newObj;
        originalCurrent = newObj;
      }
    }

    current[finalKey] = value;
  }

  private deleteDeep(obj: Record<string, unknown>, path: string): void {
    const keys = path.split('.');

    if (keys.length === 1) {
      delete obj[keys[0]];
      return;
    }

    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const next = current[keys[i]];
      if (!next || typeof next !== 'object') return;
      const cloned = { ...(next as Record<string, unknown>) };
      current[keys[i]] = cloned;
      current = cloned;
    }
    delete current[keys[keys.length - 1]];
  }
}
