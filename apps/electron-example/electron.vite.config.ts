import { join, resolve } from 'node:path';
import fs from 'node:fs';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

console.log('ZUBRIDGE_MODE', process.env.ZUBRIDGE_MODE);

// Get the current mode from environment variables
const mode = process.env.ZUBRIDGE_MODE || 'basic'; // Default to basic if not specified
const outDir = `out-${mode}`; // Create mode-specific output directory

console.log(`[DEBUG] Mode: ${mode}, OutDir: ${outDir}`);

// Debug plugin to show output of main build
const debugPlugin = () => ({
  name: 'debug-plugin',
  buildStart() {
    console.log('[DEBUG] Main build start');
  },
  buildEnd() {
    console.log('[DEBUG] Main build end');
  },
  writeBundle(options, bundle) {
    console.log('[DEBUG] Write bundle called');
    console.log('[DEBUG] Bundle output directory:', options.dir);
    console.log('[DEBUG] Files in bundle:');
    Object.keys(bundle).forEach((file) => {
      console.log(`- ${file}`);
    });
  },
  closeBundle() {
    console.log('[DEBUG] Main closeBundle called');
    console.log('[DEBUG] Checking output directory content');
    try {
      const outputDir = resolve(__dirname, outDir);
      if (fs.existsSync(outputDir)) {
        console.log(`[DEBUG] Files in ${outDir}:`);
        const files = fs.readdirSync(outputDir);
        console.log(files);
      } else {
        console.log(`[DEBUG] Output directory does not exist: ${outDir}`);
      }
    } catch (error) {
      console.error('[DEBUG] Error checking output directory:', error);
    }
  },
});

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@zubridge/electron'] }), debugPlugin()],
    build: {
      outDir: join(outDir, 'main'),
      rollupOptions: {
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
        },
      },
    },
  },
  preload: {
    // Don't use any plugins for the preload script
    // This ensures that electron and other Node.js modules are properly bundled
    build: {
      outDir: join(outDir, 'preload'),
      minify: false,
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        // Add an alias for @zubridge/electron to use a browser-safe version
        '@zubridge/electron': resolve(__dirname, '../../packages/electron/dist/index.js'),
        '@zubridge/types': resolve(__dirname, '../../packages/types/dist/index.js'),
      },
    },
    plugins: [react()],
    build: {
      outDir: join(outDir, 'renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
        output: {
          format: 'es',
        },
      },
    },
    // Define globals for the renderer process
    define: {
      // This prevents errors with __dirname in the renderer
      '__dirname': JSON.stringify(''),
      '__filename': JSON.stringify(''),
      // This prevents errors with process.env in the renderer
      'process.env': '{}',
      // Let the renderer know which mode it's running in
      'import.meta.env.VITE_ZUBRIDGE_MODE': JSON.stringify(mode),
    },
    // Optimize dependencies
    optimizeDeps: {
      include: ['zustand', '@zubridge/types'],
    },
  },
});
