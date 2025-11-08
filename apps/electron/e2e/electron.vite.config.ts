import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { debug } from '@zubridge/core';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

import type { Plugin } from 'vite';

// Get __dirname equivalent in ES modules
const __dirname = fileURLToPath(new URL('.', import.meta.url));

debug('vite:config', 'ZUBRIDGE_MODE', process.env.ZUBRIDGE_MODE);

// Get the current mode from environment variables
const mode = process.env.ZUBRIDGE_MODE || 'zustand-basic'; // Default to zustand-basic if not specified
const outDirName = `out-${mode}`; // Create mode-specific output directory
const shouldWatchUI = process.env.WATCH_UI === 'true';

debug('vite:config', `Mode: ${mode}, OutDirName: ${outDirName}, Watch UI: ${shouldWatchUI}`);

// Debug plugin to show output of main build
const debugPlugin = () => ({
  name: 'debug-plugin',
  buildStart() {
    debug('vite:config', 'Main build start');
  },
  buildEnd() {
    debug('vite:config', 'Main build end');
  },
  writeBundle(options, bundle) {
    debug('vite:config', 'Write bundle called');
    debug('vite:config', 'Bundle output directory:', options.dir);
    debug('vite:config', 'Files in bundle:');
    Object.keys(bundle).forEach((file) => {
      debug('vite:config', `- ${file}`);
    });
  },
  closeBundle() {
    debug('vite:config', 'Main closeBundle called');
    debug('vite:config', 'Checking output directory content', outDirName);
    try {
      const outputDir = resolve(__dirname, outDirName);
      if (fs.existsSync(outputDir)) {
        debug('vite:config', `Files in ${outDirName}:`);
        const files = fs.readdirSync(outputDir);
        debug('vite:config', 'Output directory files:', files);
      } else {
        debug('vite:config', `Output directory does not exist: ${outDirName}`);
      }
    } catch (error) {
      debug('vite:config:error', 'Error checking output directory:', error);
    }
  },
});

// Resolver plugin for external CSS
const externalCssResolverPlugin = (): Plugin => {
  return {
    name: 'external-css-resolver',
    // Load hook to intercept and handle CSS imports
    load(id) {
      if (id === '@zubridge/ui/styles.css') {
        debug('vite:config', 'UI styles requested, searching for CSS file...');

        const possiblePaths = [
          // Try to find in node_modules first
          resolve(__dirname, 'node_modules/@zubridge/ui/dist/styles.css'),
          // Then in workspace package
          resolve(__dirname, '../../../packages/ui/dist/styles.css'),
        ];

        // Debug each path
        possiblePaths.forEach((path) => {
          const exists = fs.existsSync(path);
          debug('vite:config', `Checking path: ${path}, exists: ${exists}`);
        });

        // Find the first existing path
        const cssPath = possiblePaths.find((path) => fs.existsSync(path));

        if (cssPath) {
          debug('vite:config', `Found UI styles at ${cssPath}`);
          try {
            const content = fs.readFileSync(cssPath, 'utf8');
            debug('vite:config', `Read ${content.length} characters from styles.css`);
            return content;
          } catch (err) {
            debug('vite:config:error', `Error reading CSS file: ${err}`);
          }
        }

        debug('vite:config:warn', 'UI styles not found, returning empty CSS');

        // Return an empty CSS file
        return '/* No styles found */';
      }

      return null; // Let Vite handle other imports
    },

    // Resolve hook to handle the CSS import path
    resolveId(id) {
      if (id === '@zubridge/ui/styles.css') {
        // Return the id unchanged to be handled by our load hook
        return id;
      }
      return null;
    },
  };
};

// Configure renderer plugins based on whether we should watch UI
const getRendererPlugins = async () => {
  const plugins = [react() as unknown as Plugin, tailwindcss(), externalCssResolverPlugin()];

  // Only add the UI watcher plugin if WATCH_UI=true
  if (shouldWatchUI) {
    debug('vite:config', 'Adding UI watcher plugin');
    // Import our custom UI watcher plugin
    try {
      const { watchUIPackage } = await import('@zubridge/ui/vite-plugin');
      plugins.push(watchUIPackage());
    } catch (error) {
      debug('vite:config:error', 'Error adding UI watcher plugin:', error);
    }
  }

  return plugins;
};

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@zubridge/core', '@zubridge/electron', '@zubridge/apps-shared'],
      }),
      debugPlugin(),
    ],
    build: {
      outDir: join(outDirName, 'main'),
      rollupOptions: {
        external: [
          // Externalize optional logging dependencies (they're loaded dynamically if available)
          '@wdio/logger',
          'weald',
        ],
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
      outDir: join(outDirName, 'preload'),
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
        // Add aliases of core packages to use browser-safe versions
        '@zubridge/core': resolve(__dirname, '../../../packages/core/dist/index.js'),
        '@zubridge/electron': resolve(__dirname, '../../../packages/electron/dist/renderer.js'),
        '@zubridge/middleware': resolve(__dirname, '../../../packages/middleware/dist/index.js'),
        '@zubridge/types': resolve(__dirname, '../../../packages/types/dist/index.js'),
      },
    },
    plugins: await getRendererPlugins(),
    css: {
      postcss: resolve(__dirname, 'postcss.config.js'),
    },
    build: {
      outDir: join(outDirName, 'renderer'),
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
      __dirname: JSON.stringify(''),
      __filename: JSON.stringify(''),
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
