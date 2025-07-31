import { type BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { isDev } from '@zubridge/electron/main';
import { createDispatch } from '@zubridge/electron/main';

import type { Dispatch } from '@zubridge/types';
import type { State } from '../../features/index.js';
import type { ZustandBridge } from '@zubridge/electron/main';
import type { StateManager, AnyState } from '@zubridge/types';

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
 * Base system tray implementation that can be extended by different modes
 */
export abstract class BaseSystemTray {
  protected electronTray: Tray | undefined;
  protected windows: BrowserWindow[] = [];
  protected dispatch: ReturnType<typeof createDispatch> | undefined;

  /**
   * Updates the tray menu with current state
   */
  protected update(state: State) {
    if (!this.electronTray) {
      this.electronTray = new Tray(trayIcon);
    }

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: `Counter: ${state.counter}`,
        enabled: false,
      },
      {
        label: `Theme: ${state.theme}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Increment Counter',
        click: () => {
          console.log('[Tray] Incrementing counter');
          this.dispatch?.('COUNTER:INCREMENT');
        },
      },
      {
        label: 'Decrement Counter',
        click: () => {
          console.log('[Tray] Decrementing counter');
          this.dispatch?.('COUNTER:DECREMENT');
        },
      },
      { type: 'separator' },
      {
        label: 'Toggle Theme',
        click: () => {
          console.log('[Tray] Toggling theme');
          this.dispatch?.('THEME:TOGGLE');
        },
      },
      { type: 'separator' },
      {
        label: 'Show Windows',
        click: () => {
          this.windows.forEach((window) => {
            if (window.isMinimized()) {
              window.restore();
            }
            window.show();
            window.focus();
          });
        },
      },
      {
        label: 'Hide Windows',
        click: () => {
          this.windows.forEach((window) => {
            window.hide();
          });
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          console.log('[Tray] Quitting app');
          process.exit(0);
        },
      },
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    this.electronTray.setContextMenu(contextMenu);
    this.electronTray.setToolTip('Zubridge Minimal App');
  }

  /**
   * Abstract method that must be implemented by subclasses
   */
  abstract init(...args: any[]): void;

  public destroy = () => {
    if (this.electronTray) {
      this.electronTray.destroy();
      this.electronTray = undefined;
    }
  };
}
