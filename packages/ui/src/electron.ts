// Export Electron-specific components and utilities

export type { ElectronAppProps } from './components/AppBase/hoc/withElectron';
export { withElectron } from './components/AppBase/hoc/withElectron';
// Export shared hooks
export { useBridgeStatus } from './components/AppBase/hooks/useBridgeStatus';
// Re-export shared components
export * from './components/Button';
export * from './components/CounterActions';
export * from './components/Header';
export * from './components/ThemeToggle';
export * from './components/WindowActions';
export * from './components/WindowDisplay';

// Import types to augment Window interface
import './types.js';
