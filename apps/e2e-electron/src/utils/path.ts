import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import fs from 'node:fs';

/**
 * Get the equivalent of __dirname for the caller's module
 * @returns The dirname equivalent as a string
 */
export const getDirname = (): string => {
  // Get the URL of the caller using Error stack trace
  const stackTrace = new Error().stack;
  const callerFilePath =
    stackTrace?.split('\n')[2].match(/at.*\((.*):[0-9]+:[0-9]+\)/)?.[1] || import.meta.url;

  // Convert from ES module URL to filesystem path
  return callerFilePath.startsWith('file:')
    ? path.dirname(fileURLToPath(callerFilePath))
    : callerFilePath;
};

/**
 * Gets the absolute path to the preload script
 * @returns The absolute path to the preload script
 */
export const getPreloadPath = (): string => {
  // In production, the app is packaged and the paths are different
  if (app.isPackaged) {
    // Determine if the app is packed as an ASAR archive or as a directory
    const asarPath = path.join(process.resourcesPath, 'app.asar');
    let preloadPath;
    if (fs.existsSync(asarPath)) {
      // Packaged as ASAR
      preloadPath = path.join(asarPath, 'preload', 'index.cjs');
      console.log(`[Path Utils] Production preload path (ASAR): ${preloadPath}`);
    } else {
      // Packaged as a directory (asar: false)
      preloadPath = path.join(process.resourcesPath, 'app', 'preload', 'index.cjs');
      console.log(`[Path Utils] Production preload path (unpacked): ${preloadPath}`);
    }
    return preloadPath;
  }

  // In development, use the local path
  const mode = process.env.ZUBRIDGE_MODE || 'zustand-basic';
  const outDir = `out-${mode}`;

  // Get the directory path using our utility
  const dirPath = getDirname();

  const appRoot = path.resolve(dirPath, '..', '..');
  const preloadPath = path.resolve(appRoot, outDir, 'preload', 'index.cjs');

  console.log(`[Path Utils] Development preload path: ${preloadPath}`);
  return preloadPath;
};

/**
 * Gets the path to resources in the app
 * @param relativePath Path relative to app resources
 * @returns The absolute path to the resource
 */
export const getResourcePath = (relativePath: string): string => {
  if (app.isPackaged) {
    // In production, resources are in the resources directory
    return path.join(process.resourcesPath, relativePath);
  }

  // In development, they're relative to the project root
  const dirPath = getDirname();
  return path.resolve(dirPath, '../..', 'resources', relativePath);
};
