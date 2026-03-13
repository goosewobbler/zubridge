export interface DeltaConfig {
  enabled: boolean;
}

export interface Delta<S> {
  type: 'delta' | 'full';
  changed?: Record<string, unknown>;
  removed?: string[];
  fullState?: Partial<S>;
}

export const DEFAULT_DELTA_CONFIG: Required<DeltaConfig> = {
  enabled: true,
};

export function getDeltaConfig(userConfig?: Partial<DeltaConfig>): Required<DeltaConfig> {
  return {
    enabled: userConfig?.enabled ?? DEFAULT_DELTA_CONFIG.enabled,
  };
}
