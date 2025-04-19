// @ts-ignore: React is used for JSX
import React from 'react';
import { useState, useEffect } from 'react';
import { useDispatch } from '@zubridge/electron';
import { useStore } from './hooks/useStore';
import './styles/runtime-window.css';
import type { State } from '../types/index.js';
import type { AnyState } from '@zubridge/types';

interface RuntimeAppProps {
  modeName: string;
  windowId: number;
}

interface CounterObject {
  value: number;
}

export function RuntimeApp({ modeName, windowId }: RuntimeAppProps) {
  const dispatch = useDispatch();

  // Get counter value from store
  const counter = useStore((state) => {
    // Handle both number and object formats
    const counterValue = state.counter as number | CounterObject | undefined;

    if (counterValue && typeof counterValue === 'object' && 'value' in counterValue) {
      console.log(`[Runtime ${windowId}] Counter is an object with value property:`, counterValue);
      return counterValue.value;
    }

    return counterValue;
  });

  // Get theme value from store
  const isDarkMode = useStore((state) => {
    return state.theme?.isDark ?? false;
  });

  const incrementCounter = () => {
    try {
      console.log(`[Runtime ${windowId}] Dispatching COUNTER:INCREMENT action`);
      dispatch('COUNTER:INCREMENT');
    } catch (error) {
      console.error('Error dispatching increment action:', error);
    }
  };

  const decrementCounter = () => {
    try {
      console.log(`[Runtime ${windowId}] Dispatching COUNTER:DECREMENT action`);
      dispatch('COUNTER:DECREMENT');
    } catch (error) {
      console.error('Error dispatching decrement action:', error);
    }
  };

  const doubleCounterThunk = () => {
    try {
      console.log(`[Runtime ${windowId}] Dispatching double counter thunk`);
      dispatch((getState, dispatch) => {
        const currentState = getState();
        console.log(`[Runtime ${windowId}] Thunk getState result:`, currentState);

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

        console.log(`[Runtime ${windowId}] Thunk: Doubling counter from ${currentValue} to ${currentValue * 2}`);
        dispatch('COUNTER:SET', currentValue * 2);
      });
    } catch (error) {
      console.error('Error dispatching double counter thunk:', error);
    }
  };

  const doubleCounterAction = () => {
    try {
      // Handle both number and object formats
      let currentValue = 0;

      if (counter !== undefined) {
        if (typeof counter === 'object' && counter !== null && 'value' in counter) {
          const counterObj = counter as CounterObject;
          currentValue = counterObj.value;
        } else if (typeof counter === 'number') {
          currentValue = counter;
        }
      }

      console.log(`[Runtime ${windowId}] Action Object: Doubling counter from ${currentValue} to ${currentValue * 2}`);
      dispatch({ type: 'COUNTER:SET', payload: currentValue * 2 });
    } catch (error) {
      console.error('Error dispatching double counter action:', error);
    }
  };

  const toggleTheme = () => {
    try {
      console.log(`[Runtime ${windowId}] Dispatching THEME:TOGGLE action`);
      dispatch('THEME:TOGGLE');
    } catch (error) {
      console.error('Error dispatching theme toggle action:', error);
    }
  };

  const createWindow = async () => {
    try {
      console.log(`[Runtime ${windowId}] Requesting new runtime window...`);
      const result = await window.electronAPI?.createRuntimeWindow();
      if (result?.success) {
        console.log(`[Runtime ${windowId}] Runtime window created successfully (ID: ${result.windowId}).`);
      } else {
        console.error(`[Runtime ${windowId}] Failed to create runtime window.`);
      }
    } catch (error) {
      console.error(`[Runtime ${windowId}] Error requesting runtime window:`, error);
    }
  };

  const closeWindow = () => {
    try {
      window.electronAPI?.closeCurrentWindow();
    } catch (error) {
      console.error('Error closing window:', error);
    }
  };

  // Apply theme based on state
  useEffect(() => {
    // Remove both theme classes first
    document.body.classList.remove('dark-theme', 'light-theme');

    // Add the appropriate theme class
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.add('light-theme');
    }

    console.log(`[Runtime ${windowId}] Theme set to ${isDarkMode ? 'dark' : 'light'} mode`);
  }, [isDarkMode, windowId]);

  // Format counter for display to ensure we always render a primitive
  const displayCounter =
    typeof counter === 'object' && counter !== null && 'value' in counter ? (counter as CounterObject).value : counter;

  return (
    <div className="app-container runtime-window">
      <div className="fixed-header">
        Runtime Window - {modeName} (ID: <span className="window-id">{windowId}</span>)
      </div>

      <div className="content">
        <div className="counter-section">
          <h2>Counter: {displayCounter}</h2>
          <div className="button-group">
            <button onClick={decrementCounter}>-</button>
            <button onClick={incrementCounter}>+</button>
            <button onClick={doubleCounterThunk}>double (thunk)</button>
            <button onClick={doubleCounterAction}>double (action object)</button>
          </div>
        </div>

        <div className="theme-section">
          <div className="button-group theme-button-group">
            <button onClick={toggleTheme}>Toggle Theme</button>
          </div>
        </div>

        <div className="window-section">
          <div className="button-group window-button-group">
            <button onClick={createWindow} className="create-window-button">
              Create Window
            </button>
            <button onClick={closeWindow} className="close-button">
              Close Window
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
