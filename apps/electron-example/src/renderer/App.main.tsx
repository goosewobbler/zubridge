// @ts-ignore: React is used for JSX transformation
import React from 'react';
import { useStore } from './hooks/useStore';
import { useDispatch } from '@zubridge/electron';
import './styles/main-window.css';

// Define props expected from AppWrapper
interface MainAppProps {
  windowId: number;
  modeName: string;
  windowType?: 'main' | 'secondary'; // Add window type parameter
}

interface CounterObject {
  value: number;
}

export function MainApp({ windowId, modeName, windowType = 'main' }: MainAppProps) {
  const dispatch = useDispatch();

  // Get counter value from store
  const counter = useStore((state) => {
    console.log('[App.main] Reading counter from state:', state);

    // Handle both number and object formats
    const counterValue = state.counter as number | CounterObject | undefined;

    if (counterValue && typeof counterValue === 'object' && 'value' in counterValue) {
      console.log('[App.main] Counter is an object with value property:', counterValue);
      return counterValue.value;
    }

    return counterValue;
  });

  // Get theme value from store
  const isDarkMode = useStore((state) => {
    return state.theme?.isDark ?? false;
  });

  // Apply theme based on state
  React.useEffect(() => {
    // Remove both theme classes first
    document.body.classList.remove('dark-theme', 'light-theme');

    // Add the appropriate theme class
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.add('light-theme');
    }

    console.log(`[App.main] Theme set to ${isDarkMode ? 'dark' : 'light'} mode`);
  }, [isDarkMode]);

  // Log counter value when it changes
  React.useEffect(() => {
    console.log('[App.main] Counter value in component:', counter);
  }, [counter]);

  const handleIncrement = () => {
    console.log('[App.main] Handling increment');
    dispatch('COUNTER:INCREMENT');
  };

  const handleDecrement = () => {
    console.log('[App.main] Handling decrement');
    dispatch('COUNTER:DECREMENT');
  };

  const handleDoubleCounter = () => {
    console.log('[App.main] Handling double via thunk');
    // Use a thunk to get the current state and dispatch a new action
    dispatch((getState, dispatch) => {
      const currentState = getState();
      console.log('[App.main] Thunk getState result:', currentState);

      // Handle both number and object formats in the thunk
      let currentValue = 0;
      const counterValue = currentState.counter as number | CounterObject | undefined;

      if (counterValue) {
        if (typeof counterValue === 'object' && 'value' in counterValue) {
          currentValue = counterValue.value;
        } else if (typeof counterValue === 'number') {
          currentValue = counterValue;
        }
      }

      console.log(`[${windowType} ${windowId}] Thunk: Doubling counter from ${currentValue} to ${currentValue * 2}`);

      // Dispatch a special action to set the counter to double its current value
      dispatch('COUNTER:SET', currentValue * 2);
    });
  };

  const handleDoubleWithObject = () => {
    console.log('[App.main] Handling double via object');
    // Handle both number and object formats for double with object
    let currentValue = 0;

    if (counter !== undefined) {
      if (typeof counter === 'object' && counter !== null && 'value' in counter) {
        const counterObj = counter as CounterObject;
        currentValue = counterObj.value;
      } else if (typeof counter === 'number') {
        currentValue = counter;
      }
    }

    console.log(
      `[${windowType} ${windowId}] Action Object: Doubling counter from ${currentValue} to ${currentValue * 2}`,
    );

    // Dispatch an action object with type and payload
    dispatch({
      type: 'COUNTER:SET',
      payload: currentValue * 2,
    });
  };

  const handleToggleTheme = () => {
    console.log('[App.main] Toggling theme');
    dispatch('THEME:TOGGLE');
  };

  // Restore window creation function
  const handleCreateWindow = async () => {
    try {
      console.log(`[${windowType} ${windowId}] Requesting new runtime window...`);
      const result = await window.electronAPI?.createRuntimeWindow();
      if (result?.success) {
        console.log(`[${windowType} ${windowId}] Runtime window created successfully (ID: ${result.windowId}).`);
      } else {
        console.error(`[${windowType} ${windowId}] Failed to create runtime window.`);
      }
    } catch (error) {
      console.error(`[${windowType} ${windowId}] Error requesting runtime window:`, error);
    }
  };

  const handleQuitApp = () => {
    try {
      // Use the RENAMED API
      window.electronAPI?.quitApp();
    } catch (error) {
      console.error('Error quitting app:', error);
    }
  };

  // Determine window title based on type
  const windowTitle = windowType === 'secondary' ? 'Secondary' : 'Main';

  // Format counter for display to ensure we always render a primitive (number or string)
  const displayCounter =
    typeof counter === 'object' && counter !== null && 'value' in counter ? (counter as CounterObject).value : counter;

  return (
    <div className="app-container">
      {/* Fixed header to display window ID and type */}
      <div className="fixed-header">
        {windowTitle} Window - {modeName} (ID: <span className="window-id">{windowId}</span>)
      </div>

      <div className="content">
        {/* Counter Section */}
        <div className="counter-section">
          <h2>Counter: {displayCounter}</h2>
          <div className="button-group">
            <button onClick={handleDecrement}>-</button>
            <button onClick={handleIncrement}>+</button>
            <button onClick={handleDoubleCounter}>Double (Thunk)</button>
            <button onClick={handleDoubleWithObject}>Double (Action Object)</button>
          </div>
        </div>

        {/* Theme Section */}
        <div className="theme-section">
          <div className="button-group theme-button-group">
            <button onClick={handleToggleTheme}>Toggle Theme</button>
            <button onClick={handleCreateWindow} className="create-window-button">
              Create Window
            </button>
            {/* Only show quit button on main window */}
            {windowType === 'main' && (
              <button onClick={handleQuitApp} className="close-button">
                Quit App
              </button>
            )}
            {/* Show close button on secondary window */}
            {windowType === 'secondary' && (
              <button onClick={() => window.electronAPI?.closeCurrentWindow()} className="close-button">
                Close Window
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
