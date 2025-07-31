export interface AppState {
  counter?: number;
  theme?: {
    is_dark: boolean;
  };
  __bridge_status?: 'ready' | 'error' | 'initializing';
}
