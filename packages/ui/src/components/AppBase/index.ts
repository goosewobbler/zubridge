// Export the base component
export { ZubridgeApp } from './ZubridgeApp';

// Export the platform-specific components
export { ElectronApp } from './hoc/withElectron';
export { TauriApp } from './hoc/withTauri';

// Export types
export type { WindowInfo, WindowType, PlatformHandlers } from './WindowInfo';
export { getWindowTitle } from './WindowInfo';
export type { ZubridgeAppProps } from './ZubridgeApp';
export type { ElectronAppProps } from './hoc/withElectron';
export type { TauriAppProps } from './hoc/withTauri';

// Export selectors
export { getCounterSelector, getThemeSelector, getBridgeStatusSelector } from './selectors';
export type { CounterObject, ThemeState, AppState, Selector } from './selectors';
