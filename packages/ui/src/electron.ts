// Export Electron-specific components and utilities
export { withElectron } from './components/AppBase/hoc/withElectron';
export type { ElectronAppProps } from './components/AppBase/hoc/withElectron';

// Re-export shared components
export * from './components/Button';
export * from './components/Counter';
export * from './components/Header';
export * from './components/ThemeToggle';
export * from './components/WindowActions';
export * from './components/WindowDisplay';

// Export shared hooks
export { useBridgeStatus } from './components/AppBase/hooks/useBridgeStatus';

// Import types to augment Window interface
import './types.js';
