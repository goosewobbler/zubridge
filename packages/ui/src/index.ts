// Export shared components
export * from './components/Button';
export * from './components/Counter';
export * from './components/Header';
export * from './components/ThemeToggle';
export * from './components/WindowActions';
export * from './components/WindowDisplay';

// Export AppBase components without platform-specific HOCs
export * from './components/AppBase';

// Export shared hooks
export { useBridgeStatus } from './components/AppBase/hooks/useBridgeStatus';

// Export component types
export type { ElectronAppProps } from './components/AppBase/hoc/withElectron';
export type { TauriAppProps } from './components/AppBase/hoc/withTauri';

// Import types to augment Window interface
import './types.js';

/**
 * Styles are bundled separately as CSS.
 * To use these styles in your application, import them directly:
 *
 * ```js
 * // Import styles in your entry file
 * import '@zubridge/ui/styles.css';
 * ```
 */

// Import styles with Tailwind CSS
// import './styles/tailwind.css';

// Export styles - make them available to consuming applications
// import './styles/index.css';

// Note: The CSS file will be generated separately and included in the package
// Consuming applications should import this CSS file
// Example: import '@zubridge/ui/styles.css';
