import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Carefully calculate all paths to ensure consistency
console.log(`[PATH DEBUG] __dirname: ${__dirname}`);
console.log(`[PATH DEBUG] Working directory: ${process.cwd()}`);

// Our app directory (e.g. apps/tauri-v1-example)
const appDir = __dirname;

// Read the tauri.conf.json to determine where to output files
const tauriConfPath = path.join(appDir, 'src-tauri/tauri.conf.json');
console.log(`[PATH DEBUG] Tauri config path: ${tauriConfPath}`);

// Read Tauri's config to know where it expects assets
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
const { distDir } = tauriConf.build; // v1 uses distDir
console.log(`[PATH DEBUG] Tauri distDir setting: ${distDir}`);

// Calculate where Tauri expects the assets (relative to src-tauri)
const srcTauriDir = path.resolve(appDir, 'src-tauri');
const tauriExpectedDist = path.resolve(srcTauriDir, distDir);
console.log(`[PATH DEBUG] Tauri expected dist location: ${tauriExpectedDist}`);

// Calculate path from Vite's renderer root to the Tauri expected dist
const viteRoot = path.join(appDir, 'src/renderer');
const relativePathFromViteToTarget = path.relative(viteRoot, tauriExpectedDist);
console.log(`[PATH DEBUG] Path from Vite to Tauri dist: ${relativePathFromViteToTarget}`);

// Check if we should watch UI package changes
const shouldWatchUI = process.env.WATCH_UI === 'true';
console.log(`[DEBUG] Watch UI: ${shouldWatchUI}`);

// Configure plugins based on whether we should watch UI
const getPlugins = async () => {
  const plugins = [react()];

  // Only add the UI watcher plugin if WATCH_UI=true
  if (shouldWatchUI) {
    console.log('[DEBUG] Adding UI watcher plugin');
    try {
      const { watchUIPackage } = await import('@zubridge/ui/vite-plugin');
      plugins.push([watchUIPackage()]);
    } catch (error) {
      console.warn('[DEBUG] Failed to load UI watcher plugin:', error);
    }
  }

  return plugins;
};

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: await getPlugins(),

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
    // Output directly to where Tauri v1 expects assets (relative to src/renderer)
    outDir: relativePathFromViteToTarget,
    // Empty the output directory before building
    emptyOutDir: true,
  },
}));
