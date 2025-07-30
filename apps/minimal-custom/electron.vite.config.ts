import { resolve } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const isWindows = process.platform === 'win32';

// Check directory structure for Windows alias debugging
if (isWindows) {
  console.log('Windows detected - checking directory structure:');
  console.log('  __dirname:', __dirname);

  // Check local node_modules
  const localNodeModules = resolve(__dirname, 'node_modules');
  console.log('  Local node_modules:', localNodeModules);
  console.log('  Local node_modules exists:', existsSync(localNodeModules));

  if (existsSync(localNodeModules)) {
    console.log('  Contents of local node_modules:');
    readdirSync(localNodeModules).forEach((item) => console.log('    -', item));

    // Check for @zubridge scope
    const zubridgeScope = resolve(localNodeModules, '@zubridge');
    console.log('  @zubridge scope exists:', existsSync(zubridgeScope));

    if (existsSync(zubridgeScope)) {
      console.log('  Contents of @zubridge:');
      readdirSync(zubridgeScope).forEach((item) => console.log('    -', item));
    }
  }

  // Check parent node_modules (monorepo)
  const parentNodeModules = resolve(__dirname, '../../node_modules');
  console.log('  Parent node_modules:', parentNodeModules);
  console.log('  Parent node_modules exists:', existsSync(parentNodeModules));

  if (existsSync(parentNodeModules)) {
    const parentZubridge = resolve(parentNodeModules, '@zubridge');
    console.log('  Parent @zubridge scope exists:', existsSync(parentZubridge));

    if (existsSync(parentZubridge)) {
      console.log('  Contents of parent @zubridge:');
      readdirSync(parentZubridge).forEach((item) => console.log('    -', item));

      const parentCore = resolve(parentZubridge, 'core');
      if (existsSync(parentCore)) {
        console.log('  Contents of parent @zubridge/core:');
        readdirSync(parentCore).forEach((item) => console.log('    -', item));
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: ['electron', '@zubridge/electron', '@zubridge/electron/main', '@zubridge/types', 'zustand'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        external: ['electron', '@zubridge/electron', '@zubridge/electron/preload', '@zubridge/types', 'zustand'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
        external: ['electron'],
      },
    },
    // workaround for windows path issue
    // see https://github.com/alex8088/electron-vite/issues/802
    ...(isWindows && {
      resolve: {
        preserveSymlinks: true,
        alias: (() => {
          const electronPackagePath = resolve(__dirname, 'node_modules/@zubridge/electron');
          console.log('  Electron package path:', electronPackagePath);
          console.log('  Electron package exists:', existsSync(electronPackagePath));

          if (existsSync(electronPackagePath)) {
            console.log('  Contents of electron package:');
            readdirSync(electronPackagePath).forEach((item) => console.log('    -', item));

            const electronNodeModules = resolve(electronPackagePath, 'node_modules');
            console.log('  Electron node_modules exists:', existsSync(electronNodeModules));

            if (existsSync(electronNodeModules)) {
              console.log('  Contents of electron node_modules:');
              readdirSync(electronNodeModules).forEach((item) => console.log('    -', item));

              const electronZubridge = resolve(electronNodeModules, '@zubridge');
              if (existsSync(electronZubridge)) {
                console.log('  Contents of electron @zubridge:');
                readdirSync(electronZubridge).forEach((item) => console.log('    -', item));
              }
            }
          }

          // Since @zubridge/core is bundled into the electron package, point to the electron dist
          const aliasPath = resolve(electronPackagePath, 'dist/index.js');
          console.log('  Alias path for @zubridge/core (bundled):', aliasPath);
          console.log('  Alias path exists:', existsSync(aliasPath));
          return {
            '@zubridge/core': aliasPath,
          };
        })(),
      },
    }),
  },
});
