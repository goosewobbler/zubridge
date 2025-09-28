# Troubleshooting

This guide covers common issues you might encounter when using Zubridge with Electron and how to resolve them.

## ESM Preload Scripts

### Overview

While Electron has added support for ES Modules (ESM) since version 28.0.0, choosing to use ESM instead of CommonJS (CJS) in preload scripts comes with significant limitations and caveats. Zubridge provides dual ESM / CJS entry points for flexibility, but we recommend using CJS for preload scripts in most cases.

### Known Issues with ESM Preload Scripts

The [Electron documentation on ESM preload scripts](https://www.electronjs.org/docs/latest/tutorial/esm#preload-scripts) outlines several important caveats:

1. **File Extension Requirement**: ESM preload scripts must use the `.mjs` extension. Preload scripts ignore `"type": "module"` in package.json.

2. **Sandboxing Incompatibility**: Sandboxed preload scripts cannot use ESM imports at all. You would need to use a bundler for your preload code.

3. **Race Conditions with Empty Pages**: Unsandboxed ESM preload scripts will run after page load on pages with no content, potentially leading to race conditions.

4. **Context Isolation Requirement for Dynamic Imports**: ESM preload scripts must be context isolated to use dynamic Node.js ESM imports.

5. **Module Resolution Conflicts**: When using ESM in the renderer process, you may encounter errors related to Node.js modules not being available, such as:
   ```
   Uncaught Error: Electron failed to install correctly
   ```
   or
   ```
   path.join is not a function
   ```
   or
   ```
   The requested module does not provide an export named 'X'
   ```

### Recommended Approach

Despite Zubridge providing an ESM entry point for preload scripts (`preload.mjs`), **we currently recommend using the CommonJS entry point** (`preload.cjs`) for most applications. The ESM entry point is provided for experimental use but is not extensively tested.

To use the CommonJS preload entry point with Zubridge:

```js
// In your preload script (preload.js or preload.cjs)
const { preloadBridge } = require('@zubridge/electron/preload');
const { contextBridge, ipcRenderer } = require('electron');

// Set up your bridge as usual
const { handlers } = preloadBridge();
contextBridge.exposeInMainWorld('zubridge', handlers);
```

### Recommended Approach: ESM with Compilation to CJS

For the recommended build setup using electron-vite to write ESM preload scripts that compile to CommonJS, see the [Build Setup section](./getting-started.md#build-setup-recommended) in the Getting Started guide.

### If You Must Use ESM Preload

If you still want to use ESM preload scripts with Zubridge:

1. Use the `.mjs` extension for your preload script
2. Ensure your webPreferences include:
   ```js
   webPreferences: {
     contextIsolation: true,  // Required for dynamic imports
     sandbox: false,          // ESM imports don't work with sandbox
     preload: path.resolve(__dirname, 'preload.mjs')
   }
   ```
3. Use a proper URL format for the preload path (either absolute path or file:// URL)
4. Ensure your HTML pages always have some content (never empty)
5. Import from electron using the default import syntax:
   ```js
   import electron from 'electron';
   const { contextBridge, ipcRenderer } = electron;
   ```
6. Be prepared to handle various edge cases across different Electron versions

## Other Common Issues

### State Not Synchronizing Between Main and Renderer

If state changes aren't propagating:

1. Ensure you've set up the bridge correctly in the main process
2. Check that the renderer is properly subscribed
3. Verify your window references are valid

### Action Handlers Not Being Called

If action handlers aren't being invoked:

1. Confirm your action types match exactly between renderer dispatch and handler definitions
2. Check console for any errors in the IPC communication
3. Ensure your handlers are registered before the first action is dispatched

For additional help, please [open an issue](https://github.com/goosewobbler/zubridge/issues) with detailed reproduction steps.
