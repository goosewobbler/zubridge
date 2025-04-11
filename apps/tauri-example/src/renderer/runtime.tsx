import React from 'react';
import { createRoot } from 'react-dom/client';
import { RuntimeApp } from './App.runtime';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

// Get or generate window ID
const getWindowId = async () => {
  try {
    // Try to get from electron API if available
    if (window.electron?.getWindowId) {
      return await window.electron.getWindowId();
    }
  } catch (error) {
    console.error('Error getting window ID:', error);
  }
  // Fallback to random ID
  return Math.floor(Math.random() * 10000);
};

// Render with async data
const renderApp = async () => {
  const windowId = await getWindowId();

  root.render(
    <React.StrictMode>
      <RuntimeApp modeName="reducers" windowId={windowId} />
    </React.StrictMode>,
  );
};

renderApp();
