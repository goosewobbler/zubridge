import { type BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { isDev } from '@zubridge/electron';

import type { StoreApi } from 'zustand';
import type { Dispatch } from '@zubridge/types';
import type { State } from '../../types/index.js';

// Expected icon paths for development and production
const devIconPath = path.join(__dirname, '..', '..', 'resources', 'electron-logo.png');
const prodIconPath = path.join(process.resourcesPath, 'electron-logo.png');

let finalTrayIconPath: string | null = null;

const checkPath = async () => {
  const isDevMode = await isDev();
  if (isDevMode) {
    console.log('[Tray Icon] Checking dev path:', devIconPath);
    if (fs.existsSync(devIconPath)) {
      finalTrayIconPath = devIconPath;
    }
  } else {
    console.log('[Tray Icon] Checking prod path:', prodIconPath);
    if (fs.existsSync(prodIconPath)) {
      finalTrayIconPath = prodIconPath;
    }
  }

  if (finalTrayIconPath) {
    console.log('[Tray Icon] Found icon at:', finalTrayIconPath);
  } else {
    console.warn('[Tray Icon] Icon not found at expected locations. Using blank icon.');
    console.log('  Checked Dev Path:', devIconPath);
    console.log('  Checked Prod Path:', prodIconPath);
  }
};

await checkPath();

const trayIcon = finalTrayIconPath
  ? nativeImage.createFromPath(finalTrayIconPath).resize({ width: 18, height: 18 })
  : nativeImage.createEmpty().resize({ width: 18, height: 18 });

/**
 * Base SystemTray class with common functionality.
 * Mode-specific implementations extend this class.
 */
export class BaseSystemTray {
  protected dispatch?: Dispatch<State>;
  protected electronTray?: Tray;
  protected window?: BrowserWindow;

  protected update = (state: State) => {
    if (!this.dispatch) {
      return;
    }
    if (!this.electronTray) {
      this.electronTray = new Tray(trayIcon);
    }

    const dispatch = this.dispatch;
    const showWindow = () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show();
        this.window.focus();
      }
    };
    const stateText = `state: ${state.counter ?? 'loading...'}`;
    const isDarkMode = state.theme?.isDark ?? false;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'decrement',
        type: 'normal',
        click: () => {
          dispatch('COUNTER:DECREMENT');
          showWindow();
        },
      },
      {
        label: stateText,
        type: 'normal',
        click: () => showWindow(),
      },
      {
        label: 'increment',
        type: 'normal',
        click: () => {
          dispatch('COUNTER:INCREMENT');
          showWindow();
        },
      },
      {
        label: 'double (thunk)',
        type: 'normal',
        click: () => {
          dispatch((getState, dispatch) => {
            const currentValue = getState().counter || 0;
            console.log(`[Tray] Thunk: Doubling counter from ${currentValue} to ${currentValue * 2}`);
            dispatch('COUNTER:SET', currentValue * 2);
          });
          showWindow();
        },
      },
      {
        label: 'double (action object)',
        type: 'normal',
        click: () => {
          const currentValue = state.counter || 0;
          console.log(`[Tray] Action Object: Doubling counter from ${currentValue} to ${currentValue * 2}`);
          dispatch({ type: 'COUNTER:SET', payload: currentValue * 2 });
          showWindow();
        },
      },
      { type: 'separator' },
      {
        label: `Switch theme to ${isDarkMode ? 'Light' : 'Dark'}`,
        type: 'normal',
        click: () => {
          console.log(
            `[Tray] Toggling theme from ${isDarkMode ? 'Dark' : 'Light'} to ${isDarkMode ? 'Light' : 'Dark'}`,
          );
          dispatch('THEME:TOGGLE');
          showWindow();
        },
      },
      { type: 'separator' },
      {
        label: 'quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.electronTray.setContextMenu(contextMenu);
    this.electronTray.setToolTip(stateText);
  };

  public init(store: StoreApi<State>, window: BrowserWindow) {
    this.window = window;

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    store.subscribe((state) => this.update(state));
  }

  public destroy = () => {
    if (this.electronTray) {
      this.electronTray.destroy();
      this.electronTray = undefined;
    }
  };
}
