// Export Tauri-specific components and utilities
export { withTauri } from './components/AppBase/hoc/withTauri';
export type { TauriAppProps } from './components/AppBase/hoc/withTauri';

// Re-export shared components
export * from './components/Button';
export * from './components/CounterActions';
export * from './components/Header';
export * from './components/ThemeToggle';
export * from './components/WindowActions';
export * from './components/WindowDisplay';

// Export shared hooks
export { useBridgeStatus } from './components/AppBase/hooks/useBridgeStatus';

// Import types to augment Window interface
import './types.js';
