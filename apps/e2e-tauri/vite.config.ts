import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Import our custom UI watcher plugin
import { watchUIPackage } from '@zubridge/ui/vite-plugin';

// Carefully calculate all paths to ensure consistency
console.log(`[PATH DEBUG] __dirname: ${__dirname}`);
console.log(`[PATH DEBUG] Working directory: ${process.cwd()}`);

// Our app directory (e.g. apps/tauri-example)
const appDir = __dirname;

// Read the tauri.conf.json to determine where to output files
const tauriConfPath = path.join(appDir, 'src-tauri/tauri.conf.json');
console.log(`[PATH DEBUG] Tauri config path: ${tauriConfPath}`);

// Read Tauri's config to know where it expects assets
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
const { frontendDist } = tauriConf.build; // v2 uses frontendDist
console.log(`[PATH DEBUG] Tauri frontendDist setting: ${frontendDist}`);

// Calculate where Tauri expects the assets (relative to src-tauri)
const srcTauriDir = path.resolve(appDir, 'src-tauri');
const tauriExpectedDist = path.resolve(srcTauriDir, frontendDist);
console.log(`[PATH DEBUG] Tauri expected dist location: ${tauriExpectedDist}`);

// Calculate path from Vite's renderer root to the Tauri expected dist
const viteRoot = path.join(appDir, 'src/renderer');
const relativePathFromViteToTarget = path.relative(viteRoot, tauriExpectedDist);
console.log(`[PATH DEBUG] Path from Vite to Tauri dist: ${relativePathFromViteToTarget}`);

// Check if we should watch UI package changes
const shouldWatchUI = process.env.WATCH_UI === 'true';
console.log(`[DEBUG] Watch UI: ${shouldWatchUI}`);

// Configure plugins based on whether we should watch UI
const getPlugins = () => {
  const plugins = [react()];

  // Only add the UI watcher plugin if WATCH_UI=true
  if (shouldWatchUI) {
    console.log('[DEBUG] Adding UI watcher plugin');
    plugins.push([watchUIPackage()]);
  }

  return plugins;
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: getPlugins(),

  // Prevent Vite from clearing the screen
  clearScreen: false,

  // Set the root directory for source files and index.html
  root: 'src/renderer',

  // Set the base path for assets during development and build
  base: './',

  // Configure the development server
  server: {
    // Use the port Tauri expects
    port: 5173,
    // Throw error if port is already in use
    strictPort: true,
    // Watch for changes in the Tauri configuration
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  // Configure the build process
  build: {
    // Output directly to where Tauri expects assets (relative to src/renderer)
    outDir: relativePathFromViteToTarget,
    // Empty the output directory before building
    emptyOutDir: true,
  },
});
