import { createUseStore, useDispatch } from '@zubridge/electron';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

// UI components
import { Button } from './components/Button.js';
import { Header } from './components/Header.js';
import { ThemeToggle } from './components/ThemeToggle.js';

// Create the store hook
const useStore = createUseStore();

function MinimalApp() {
  const store = useStore();
  const dispatch = useDispatch();
  const [windowInfo, setWindowInfo] = useState<{ type: string; id: number } | null>(null);

  // Get state values
  const counter = (store?.counter || 0) as number;
  const theme = (store?.theme || 'dark') as 'dark' | 'light';

  // Fetch window info on mount
  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('🔍 Starting app initialization...');
        console.log('🔍 window.electronAPI available:', !!window.electronAPI);
        console.log(
          '🔍 window.electronAPI keys:',
          window.electronAPI ? Object.keys(window.electronAPI) : 'N/A',
        );

        if (window.electronAPI) {
          console.log('🔍 Calling getWindowInfo()...');
          const info = await window.electronAPI.getWindowInfo();
          console.log('🔍 getWindowInfo() result:', info);
          setWindowInfo(info);
        } else {
          console.error('❌ window.electronAPI not available, setting fallback window info');
          setWindowInfo({ type: 'main', id: 1 });
        }
      } catch (error) {
        console.error('❌ Error initializing app:', error);
        console.error('❌ Setting fallback window info due to error');
        setWindowInfo({ type: 'main', id: 1 });
      }
    };
    initApp();
  }, []);

  // Apply theme to body
  useEffect(() => {
    document.body.classList.remove('dark-theme', 'light-theme');
    document.body.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');
  }, [theme]);

  // Action handlers
  const handleIncrement = async () => {
    await dispatch('COUNTER:INCREMENT');
  };

  const handleDecrement = async () => {
    await dispatch('COUNTER:DECREMENT');
  };

  const handleThemeToggle = async () => {
    await dispatch('THEME:TOGGLE');
  };

  if (!windowInfo) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen">
      <Header
        windowTitle="Basic Minimal Window"
        appName="Zubridge - Basic Minimal"
        windowId={windowInfo.id}
        windowType={windowInfo.type}
      />

      <div className="max-w-[theme(--container-width)] mx-auto my-5 mt-[60px]">
        {/* Counter Display */}
        <div className="mb-8 text-center">
          <h2 className="mb-4 text-2xl font-bold">Counter: {counter}</h2>
        </div>

        {/* Counter Actions */}
        <div className="flex flex-col gap-4 items-center mb-8">
          <div className="flex gap-4 justify-between w-full">
            <Button onClick={handleDecrement} className="flex-1">
              -
            </Button>
            <Button onClick={handleIncrement} className="flex-1">
              +
            </Button>
          </div>
        </div>

        {/* Theme Toggle */}
        <ThemeToggle theme={theme} onToggle={handleThemeToggle} />
      </div>
    </div>
  );
}

// Get the DOM container element
const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <MinimalApp />
  </React.StrictMode>,
);
