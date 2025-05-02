import { join, resolve } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import type { Plugin } from 'vite';

// Get __dirname equivalent in ES modules
const __dirname = fileURLToPath(new URL('.', import.meta.url));

console.log('ZUBRIDGE_MODE', process.env.ZUBRIDGE_MODE);

// Get the current mode from environment variables
const mode = process.env.ZUBRIDGE_MODE || 'basic'; // Default to basic if not specified
const outDir = `out-${mode}`; // Create mode-specific output directory
const shouldWatchUI = process.env.WATCH_UI === 'true';

console.log(`[DEBUG] Mode: ${mode}, OutDir: ${outDir}, Watch UI: ${shouldWatchUI}`);

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

// Resolver plugin for external CSS
const externalCssResolverPlugin = (): Plugin => {
  return {
    name: 'external-css-resolver',
    // Load hook to intercept and handle CSS imports
    load(id) {
      if (id === '@zubridge/ui/styles.css') {
        console.log('[DEBUG] UI styles requested, searching for CSS file...');

        const possiblePaths = [
          // Try to find in node_modules first
          resolve(__dirname, 'node_modules/@zubridge/ui/dist/styles.css'),
          // Then in workspace package
          resolve(__dirname, '../../packages/ui/dist/styles.css'),
        ];

        // Debug each path
        possiblePaths.forEach((path) => {
          const exists = fs.existsSync(path);
          console.log(`[DEBUG] Checking path: ${path}, exists: ${exists}`);
        });

        // Find the first existing path
        const cssPath = possiblePaths.find((path) => fs.existsSync(path));

        if (cssPath) {
          console.log(`[DEBUG] Found UI styles at ${cssPath}`);
          try {
            const content = fs.readFileSync(cssPath, 'utf8');
            console.log(`[DEBUG] Read ${content.length} characters from styles.css`);
            return content;
          } catch (err) {
            console.error(`[DEBUG] Error reading CSS file: ${err}`);
          }
        }

        console.warn('[DEBUG] UI styles not found, returning empty CSS');

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
    console.log('[DEBUG] Adding UI watcher plugin');
    // Import our custom UI watcher plugin
    try {
      const { watchUIPackage } = await import('@zubridge/ui/vite-plugin');
      plugins.push(watchUIPackage());
    } catch (error) {
      console.error('[DEBUG] Error adding UI watcher plugin:', error);
    }
  }

  return plugins;
};

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
        // Add aliases for direct imports from UI package
        '@zubridge/ui-app': resolve(__dirname, '../../packages/ui/dist/components/AppBase'),
        '@zubridge/ui-electron': resolve(__dirname, '../../packages/ui/dist/electron'),
      },
    },
    plugins: await getRendererPlugins(),
    css: {
      postcss: resolve(__dirname, 'postcss.config.js'),
    },
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
