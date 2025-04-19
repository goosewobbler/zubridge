import { type BrowserWindow } from 'electron';
import { type StoreApi } from 'zustand';
import { getZubridgeMode } from '../../utils/mode.js';
import type { State } from '../../types/index.js';

// Import mode-specific trays
import { BasicSystemTray } from '../../modes/basic/tray.js';
import { HandlersSystemTray } from '../../modes/handlers/tray.js';
import { ReducersSystemTray } from '../../modes/reducers/tray.js';
import { ReduxSystemTray } from '../../modes/redux/tray.js';
import { CustomSystemTray } from '../../modes/custom/tray.js';

/**
 * Creates a tray instance based on the current mode
 */
export function createTray(store: StoreApi<State>, window: BrowserWindow) {
  const mode = getZubridgeMode();
  console.log('Creating tray for mode:', mode);

  switch (mode) {
    case 'basic':
      const basicTray = new BasicSystemTray();
      basicTray.init(store, window);
      return basicTray;

    case 'handlers':
      const handlersTray = new HandlersSystemTray();
      handlersTray.init(store, window);
      return handlersTray;

    case 'reducers':
      const reducersTray = new ReducersSystemTray();
      reducersTray.init(store, window);
      return reducersTray;

    case 'redux':
      const reduxTray = new ReduxSystemTray();
      reduxTray.init(store, window);
      return reduxTray;

    case 'custom':
      const customTray = new CustomSystemTray();
      customTray.init(store, window);
      return customTray;

    default:
      console.warn('Unknown mode, falling back to basic tray');
      const fallbackTray = new BasicSystemTray();
      fallbackTray.init(store, window);
      return fallbackTray;
  }
}

// Export a singleton factory function
export const tray = createTray;
