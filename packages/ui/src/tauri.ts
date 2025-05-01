// Export Tauri-specific components and utilities
export { withTauri } from './components/AppBase/hoc/withTauri';

// Re-export shared components
export * from './components/Button';
export * from './components/Counter';
export * from './components/Header';
export * from './components/ThemeToggle';
export * from './components/WindowActions';
export * from './components/WindowDisplay';

// Import types to augment Window interface
import './types.js';
