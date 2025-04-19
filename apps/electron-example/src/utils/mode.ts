/**
 * The available Zubridge implementation modes
 */
export enum ZubridgeMode {
  Basic = 'basic',
  Handlers = 'handlers',
  Reducers = 'reducers',
  Redux = 'redux',
  Custom = 'custom',
}

/**
 * Gets the current Zubridge mode from the environment variable
 * Defaults to 'basic' if no mode is specified
 */
export const getZubridgeMode = (): ZubridgeMode => {
  const modeStr = process.env.ZUBRIDGE_MODE?.toLowerCase();

  // Validate that the mode is one of the supported types
  switch (modeStr) {
    case ZubridgeMode.Basic:
      return ZubridgeMode.Basic;
    case ZubridgeMode.Handlers:
      return ZubridgeMode.Handlers;
    case ZubridgeMode.Reducers:
      return ZubridgeMode.Reducers;
    case ZubridgeMode.Redux:
      return ZubridgeMode.Redux;
    case ZubridgeMode.Custom:
      return ZubridgeMode.Custom;
    default:
      // Default to basic mode
      return ZubridgeMode.Basic;
  }
};

/**
 * Returns true if the current mode is 'basic'
 */
export const isBasicMode = (): boolean => getZubridgeMode() === ZubridgeMode.Basic;

/**
 * Returns true if the current mode is 'handlers'
 */
export const isHandlersMode = (): boolean => getZubridgeMode() === ZubridgeMode.Handlers;

/**
 * Returns true if the current mode is 'reducers'
 */
export const isReducersMode = (): boolean => getZubridgeMode() === ZubridgeMode.Reducers;

/**
 * Returns true if the current mode is 'redux'
 */
export const isReduxMode = (): boolean => getZubridgeMode() === ZubridgeMode.Redux;

/**
 * Returns true if the current mode is 'custom'
 */
export const isCustomMode = (): boolean => getZubridgeMode() === ZubridgeMode.Custom;

/**
 * Returns the current mode as a human-readable string
 */
export const getModeName = (): string => {
  const mode = getZubridgeMode();
  // The enum value is already a string, just capitalize the first letter
  return mode.charAt(0).toUpperCase() + mode.slice(1);
};
