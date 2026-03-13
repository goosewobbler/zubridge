export class DeltaMerger<S> {
  merge(
    currentState: S,
    delta: {
      type: 'delta' | 'full';
      version: number;
      changed?: Record<string, unknown>;
      fullState?: Partial<S>;
    },
  ): Partial<S> {
    if (delta.type === 'full' || !delta.changed) {
      return delta.fullState || {};
    }

    const merged = { ...currentState } as Record<string, unknown>;

    for (const [keyPath, value] of Object.entries(delta.changed)) {
      this.setDeep(merged, keyPath, value);
    }

    return merged as Partial<S>;
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
