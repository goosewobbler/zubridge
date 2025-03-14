import { type BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import { createDispatch } from '@zubridge/electron/main';
import trayIconFile from '../../../../../../resources/trayIcon.png';

import { rootReducer, type State, type Store } from '../../features/index.js';

const trayIcon = nativeImage.createFromDataURL(trayIconFile).resize({
  width: 18,
  height: 18,
});

class SystemTray {
  private dispatch?: ReturnType<typeof createDispatch>;
  private electronTray?: Tray;
  private window?: BrowserWindow;

  private update = (state: State) => {
    if (!this.dispatch) {
      return;
    }
    if (!this.electronTray) {
      this.electronTray = new Tray(trayIcon);
    }

    const dispatch = this.dispatch;
    const showWindow = () => this.window?.show();
    const stateText = `state: ${state.counter ?? 'loading...'}`;
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
      { type: 'separator' },
      { label: 'quit', click: () => app.quit() },
    ]);

    this.electronTray.setContextMenu(contextMenu);
    this.electronTray.setToolTip(stateText);
  };

  public init = (store: Store, window: BrowserWindow) => {
    this.window = window;
    this.dispatch = createDispatch<State, Store>(store, { reducer: rootReducer });
    this.update(store.getState());
    store.subscribe(() => this.update(store.getState()));
  };

  public destroy = () => {
    this.electronTray?.destroy();
    this.electronTray = undefined;
  };
}

export const tray = new SystemTray();
