/**
 * The available Zubridge implementation modes
 */
export type ZubridgeMode = 'basic' | 'handlers' | 'reducers';

/**
 * Gets the current Zubridge mode from the environment variable
 * Defaults to 'basic' if no mode is specified
 */
export const getZubridgeMode = (): ZubridgeMode => {
  const mode = process.env.ZUBRIDGE_MODE?.toLowerCase() as ZubridgeMode;

  // Validate that the mode is one of the supported types
  if (mode === 'basic' || mode === 'handlers' || mode === 'reducers') {
    return mode;
  }

  // Default to basic mode
  return 'basic';
};

/**
 * Returns true if the current mode is 'basic'
 */
export const isBasicMode = (): boolean => getZubridgeMode() === 'basic';

/**
 * Returns true if the current mode is 'handlers'
 */
export const isHandlersMode = (): boolean => getZubridgeMode() === 'handlers';

/**
 * Returns true if the current mode is 'reducers'
 */
export const isReducersMode = (): boolean => getZubridgeMode() === 'reducers';

/**
 * Returns the current mode as a human-readable string
 */
export const getModeName = (): string => {
  const mode = getZubridgeMode();
  return mode.charAt(0).toUpperCase() + mode.slice(1);
};
