// Export shared components

// Export component types
export type { ElectronAppProps } from './components/AppBase/hoc/withElectron';
export type { TauriAppProps } from './components/AppBase/hoc/withTauri';
// Export shared hooks
export { useBridgeStatus } from './components/AppBase/hooks/useBridgeStatus';
export * from './components/Button';
export * from './components/CounterActions';
export * from './components/GenerateLargeState';
export * from './components/Header';
export * from './components/SubscriptionControls';
export * from './components/ThemeToggle';
export * from './components/WindowActions';
export * from './components/WindowDisplay';

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
