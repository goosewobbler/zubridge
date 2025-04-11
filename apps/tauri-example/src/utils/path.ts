import path from 'node:path';
import { app } from 'electron';

/**
 * Gets the absolute path to the preload script
 * @param fromDir The directory to resolve the path from
 * @returns The absolute path to the preload script
 */
export const getPreloadPath = (fromDir: string): string => {
  // In production, the app is packaged and the paths are different
  if (app.isPackaged) {
    // In production, the preload script is in the app.asar archive
    const preloadPath = path.join(process.resourcesPath, 'app.asar', 'preload', 'index.cjs');
    console.log(`[Path Utils] Production preload path: ${preloadPath}`);
    return preloadPath;
  }

  // In development, use the local path
  const mode = process.env.ZUBRIDGE_MODE || 'basic';
  const outDir = `out-${mode}`;
  const appRoot = path.resolve(fromDir, '..', '..');
  const preloadPath = path.resolve(appRoot, outDir, 'preload', 'index.cjs');

  console.log(`[Path Utils] Development preload path: ${preloadPath}`);
  return preloadPath;
};
