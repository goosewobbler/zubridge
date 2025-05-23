// @ts-ignore: React is used for JSX transformation
import React from 'react';
import { WebviewWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';
import type { AnyState } from '@zubridge/tauri';
import { Counter, ThemeToggle, WindowDisplay, WindowActions } from '@zubridge/ui';
import './styles/index.css';

interface MainAppProps {
  windowLabel: string;
}

interface ThemeState {
  is_dark: boolean;
}

interface AppState extends AnyState {
  counter?: number;
  theme?: ThemeState;
}

export function MainApp({ windowLabel }: MainAppProps) {
  const dispatch = useZubridgeDispatch();
  const counter = useZubridgeStore<number>((state: AppState) => state.counter ?? 0);
  const isDarkMode = useZubridgeStore<boolean>((state: AppState) => state.theme?.is_dark ?? false);
  const bridgeStatus = useZubridgeStore((state) => state.__bridge_status);
  const isMainWindow = windowLabel === 'main';

  // Apply theme based on state
  React.useEffect(() => {
    document.body.classList.remove('dark-theme', 'light-theme');
    document.body.classList.add(isDarkMode ? 'dark-theme' : 'light-theme');
  }, [isDarkMode]);

  const handleIncrement = () => {
    dispatch({ type: 'COUNTER:INCREMENT' });
  };

  const handleDecrement = () => {
    dispatch({ type: 'COUNTER:DECREMENT' });
  };

  const handleDoubleCounter = () => {
    dispatch(async (getState) => {
      const state = (await getState()) as AppState;
      const currentValue = (state.counter as number) || 0;
      dispatch({ type: 'COUNTER:SET', payload: currentValue * 2 });
    });
  };

  const handleToggleTheme = () => {
    dispatch({ type: 'THEME:TOGGLE' });
  };

  const handleResetCounter = () => {
    dispatch({ type: 'COUNTER:RESET' });
  };

  const handleCreateWindow = () => {
    const uniqueLabel = `runtime_${Date.now()}`;
    const webview = new WebviewWindow(uniqueLabel, {
      url: window.location.pathname,
      title: `Runtime Window (${uniqueLabel})`,
      width: 600,
      height: 485,
    });

    webview.once('tauri://created', () => {
      console.log(`Window ${uniqueLabel} created`);
    });
    webview.once('tauri://error', (e) => {
      console.error(`Failed to create window ${uniqueLabel}:`, e);
    });
  };

  const handleQuitApp = async () => {
    try {
      await invoke('quit_app');
    } catch (error) {
      console.error('Error invoking quit_app:', error);
    }
  };

  const handleCloseWindow = async () => {
    try {
      const currentWindow = await WebviewWindow.getByLabel(windowLabel);
      if (currentWindow) {
        await currentWindow.close();
      }
    } catch (error) {
      console.error('Error closing window:', error);
    }
  };

  return (
    <WindowDisplay
      windowId={windowLabel}
      windowTitle={isMainWindow ? 'Main Window' : 'Secondary Window'}
      mode="Tauri"
      bridgeStatus={bridgeStatus === 'uninitialized' ? 'initializing' : bridgeStatus}
    >
      <Counter
        value={counter}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onDouble={(method) => (method === 'thunk' ? handleDoubleCounter() : handleDoubleCounter())}
        onReset={handleResetCounter}
        isLoading={bridgeStatus === 'initializing'}
      />

      <div className="theme-section">
        <ThemeToggle theme={isDarkMode ? 'dark' : 'light'} onToggle={handleToggleTheme} />

        <WindowActions
          onCreateWindow={handleCreateWindow}
          onCloseWindow={handleCloseWindow}
          onQuitApp={handleQuitApp}
          isMainWindow={isMainWindow}
        />
      </div>
    </WindowDisplay>
  );
}
