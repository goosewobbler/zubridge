import { type BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { isDev } from '@zubridge/electron';

import type { Dispatch } from '@zubridge/types';
import type { State } from '../../types.js';
import type { ZustandBridge } from '@zubridge/electron/main';
import type { Store } from 'redux';

// Get icon paths
const getResourcePath = (relativePath: string): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  return path.resolve(process.cwd(), 'resources', relativePath);
};

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
 */
export class BaseSystemTray {
  protected dispatch?: Dispatch<State>;
  protected electronTray?: Tray;
  protected windows?: BrowserWindow[];

  protected update = (state: State) => {
    if (!this.dispatch) {
      return;
    }
    if (!this.electronTray) {
      this.electronTray = new Tray(trayIcon);
    }

    const dispatch = this.dispatch;
    const showWindows = () => {
      if (this.windows) {
        this.windows.forEach((window) => {
          if (window && !window.isDestroyed()) {
            window.show();
            window.focus();
          }
        });
      }
    };

    // Display items
    const counterText = `Counter: ${state.counter ?? 0}`;
    const themeText = `Theme: ${state.theme === 'dark' ? 'Dark' : 'Light'}`;

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
          showWindows();
        },
      },
      {
        label: 'Decrement',
        click: () => {
          dispatch('COUNTER:DECREMENT');
          showWindows();
        },
      },
      {
        label: 'Switch Theme',
        click: () => {
          dispatch('THEME:TOGGLE');
          showWindows();
        },
      },
      { type: 'separator' },

      // App control
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.electronTray.setContextMenu(contextMenu);
    this.electronTray.setToolTip('Zubridge Redux Minimal');

    // Remove any existing click handlers
    this.electronTray.removeAllListeners('click');

    // Add click handler to show windows on left click
    this.electronTray.on('click', showWindows);
  };

  public init(bridge: ZustandBridge, store: Store, windows: BrowserWindow[]) {
    this.windows = windows;
  }

  public destroy = () => {
    if (this.electronTray) {
      this.electronTray.destroy();
      this.electronTray = undefined;
    }
  };
}
