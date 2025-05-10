import { type BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { isDev } from '@zubridge/electron';

import type { StoreApi } from 'zustand';
import type { Dispatch } from '@zubridge/types';
import type { State } from '../../types/index.js';
import { getResourcePath } from '../../utils/path.js';

// Get icon paths using our utility functions
const devIconPath = getResourcePath('electron-logo.png');
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

    // Match Tauri example format for display items
    const counterText = `Counter: ${state.counter ?? 0}`;
    const themeText = `Theme: ${state.theme?.isDark ? 'Dark' : 'Light'}`;

    const contextMenu = Menu.buildFromTemplate([
      // Display items (non-clickable)
      {
        label: counterText,
        enabled: false,
      },
      {
        label: themeText,
        enabled: false,
      },
      { type: 'separator' },

      // Action items
      {
        label: 'Increment',
        click: () => {
          dispatch('COUNTER:INCREMENT');
          showWindow();
        },
      },
      {
        label: 'Decrement',
        click: () => {
          dispatch('COUNTER:DECREMENT');
          showWindow();
        },
      },
      {
        label: 'Reset Counter',
        click: () => {
          dispatch('COUNTER:RESET');
          showWindow();
        },
      },
      {
        label: 'Switch Theme',
        click: () => {
          dispatch('THEME:TOGGLE');
          showWindow();
        },
      },
      { type: 'separator' },

      // Window and app control
      {
        label: 'Show Window',
        click: () => showWindow(),
      },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.electronTray.setContextMenu(contextMenu);
    this.electronTray.setToolTip('Zubridge Electron Example');

    // Add click handler to show window on left click
    this.electronTray.on('click', showWindow);
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
