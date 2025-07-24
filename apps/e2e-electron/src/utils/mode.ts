/**
 * The available Zubridge implementation modes
 */
export enum ZubridgeMode {
  ZustandBasic = 'zustand-basic',
  ZustandHandlers = 'zustand-handlers',
  ZustandReducers = 'zustand-reducers',
  Redux = 'redux',
  Custom = 'custom',
}

/**
 * Gets the current Zubridge mode from the environment variable
 * Defaults to 'zustand-basic' if no mode is specified
 */
export const getZubridgeMode = (): ZubridgeMode => {
  const modeStr = process.env.ZUBRIDGE_MODE?.toLowerCase();

  // Validate that the mode is one of the supported types
  switch (modeStr) {
    case ZubridgeMode.ZustandBasic:
      return ZubridgeMode.ZustandBasic;
    case ZubridgeMode.ZustandHandlers:
      return ZubridgeMode.ZustandHandlers;
    case ZubridgeMode.ZustandReducers:
      return ZubridgeMode.ZustandReducers;
    case ZubridgeMode.Redux:
      return ZubridgeMode.Redux;
    case ZubridgeMode.Custom:
      return ZubridgeMode.Custom;
    default:
      // Default to zustand-basic mode
      return ZubridgeMode.ZustandBasic;
  }
};

/**
 * Returns true if the current mode is 'zustand-basic'
 */
export const isBasicMode = (): boolean => getZubridgeMode() === ZubridgeMode.ZustandBasic;

/**
 * Returns true if the current mode is 'zustand-handlers'
 */
export const isHandlersMode = (): boolean => getZubridgeMode() === ZubridgeMode.ZustandHandlers;

/**
 * Returns true if the current mode is 'zustand-reducers'
 */
export const isReducersMode = (): boolean => getZubridgeMode() === ZubridgeMode.ZustandReducers;

/**
 * Returns true if the current mode is 'redux'
 */
export const isReduxMode = (): boolean => getZubridgeMode() === ZubridgeMode.Redux;

/**
 * Returns true if the current mode is 'custom'
 */
export const isCustomMode = (): boolean => getZubridgeMode() === ZubridgeMode.Custom;
