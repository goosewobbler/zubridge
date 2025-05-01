// Export all components
export * from './components/AppBase';
export * from './components/Button';
export * from './components/Counter';
export * from './components/Header';
export * from './components/ThemeToggle';
export * from './components/WindowActions';
export * from './components/WindowDisplay';

// Import types to augment Window interface
import './types.js';

/**
 * Styles
 * ------
 * This package uses Tailwind CSS for styling. The styles are built and bundled
 * separately from the components.
 *
 * When using this package, you need to:
 *
 * 1. Import the styles in your application:
 *    ```jsx
 *    import '@zubridge/ui/dist/styles.css';
 *    ```
 *
 * 2. Make sure the UI package is built before your application by ensuring the
 *    build order in your workspace. In the CI/build pipeline, the UI package
 *    should be built before any application that depends on it.
 *
 * Note: During development with hot module reloading, the styles may not be available
 * immediately. You may need to build the UI package first by running:
 * ```
 * pnpm --filter @zubridge/ui build
 * ```
 */

// Import styles with Tailwind CSS
// import './styles/tailwind.css';

// Export styles - make them available to consuming applications
// import './styles/index.css';

// Note: The CSS file will be generated separately and included in the package
// Consuming applications should import this CSS file
// Example: import '@zubridge/ui/dist/styles.css';
