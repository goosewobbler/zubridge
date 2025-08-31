import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

// For resolving the UI package path correctly
const require = createRequire(import.meta.url);

/**
 * Creates a Vite plugin that watches the UI package source files and rebuilds it when they change
 */
export function watchUIPackage(): Plugin {
  // Track if a build is in progress to avoid multiple simultaneous builds
  let isBuildingUI = false;
  // Cache for the last file change time to avoid duplicate builds
  let lastChangedTime = 0;

  return {
    name: 'watch-ui-package',
    apply: 'serve', // Only apply this plugin during dev server mode

    configureServer(server: ViteDevServer) {
      // Find the absolute path to the UI package
      const uiPackagePath = path.dirname(require.resolve('@zubridge/ui/package.json'));
      const uiSourcePath = path.resolve(uiPackagePath, 'src');

      console.log(`[watch-ui-package] Watching UI package at: ${uiSourcePath}`);

      // Add the UI package source directory to the watch list
      server.watcher.add(uiSourcePath);

      // Listen for changes to UI package files
      server.watcher.on('change', async (filePath: string) => {
        // Only handle changes to UI package files
        if (!filePath.includes(uiSourcePath)) return;

        // Debounce multiple changes within a short timeframe
        const currentTime = Date.now();
        if (currentTime - lastChangedTime < 300) return;
        lastChangedTime = currentTime;

        // Skip if already building
        if (isBuildingUI) return;

        console.log(
          `[watch-ui-package] UI package file changed: ${path.relative(uiSourcePath, filePath)}`,
        );
        console.log('[watch-ui-package] Rebuilding UI package...');

        try {
          isBuildingUI = true;

          // Run the UI package build
          await new Promise<void>((resolve, reject) => {
            const buildProcess = spawn('pnpm', ['run', 'build'], {
              cwd: uiPackagePath,
              stdio: 'inherit',
              shell: true,
            });

            buildProcess.on('close', (code: number | null) => {
              if (code === 0) {
                console.log('[watch-ui-package] UI package built successfully!');
                // Trigger Vite's module reloading
                server.moduleGraph.invalidateAll();
                server.ws.send({ type: 'full-reload' });
                resolve();
              } else {
                console.error(`[watch-ui-package] UI package build failed with code ${code}`);
                reject(new Error(`UI build failed with code ${code}`));
              }
            });
          });
        } catch (error) {
          console.error('[watch-ui-package] Error building UI package:', error);
        } finally {
          isBuildingUI = false;
        }
      });
    },
  };
}

export default watchUIPackage;
