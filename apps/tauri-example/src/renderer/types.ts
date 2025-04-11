// Declare the electron interface
declare global {
  interface Window {
    electron?: {
      getWindowId: () => Promise<number>;
      isMainWindow: () => Promise<boolean>;
      getMode: () => Promise<{ mode: string; modeName: string }>;
      closeCurrentWindow: () => void;
      quitApp: () => void;
    };
  }
}

export {};
