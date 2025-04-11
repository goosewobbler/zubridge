import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

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
    // Set the output directory relative to the project root
    // This should match tauri.conf.json's `build.frontendDist` relative path
    outDir: '../dist',
    // Empty the output directory before building
    emptyOutDir: true,
  },
});
