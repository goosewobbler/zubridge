import { Configuration } from 'electron-builder';
import fs from 'fs';
import path from 'path';

// Get the current mode from environment variables, default to 'basic'
const currentMode = process.env.ZUBRIDGE_MODE || 'basic';
console.log(`[DEBUG] Mode: ${currentMode}, OutDir: out-${currentMode}`);

// Calculate the electron cache directory based on the mode
const electronCacheDir = path.join(process.cwd(), '.cache', 'electron-builder', currentMode);
console.log(`[DEBUG] Mode-specific Electron cache directory: ${electronCacheDir}`);

// Ensure the cache directory exists
if (!fs.existsSync(electronCacheDir)) {
  fs.mkdirSync(electronCacheDir, { recursive: true });
  console.log(`[DEBUG] Created mode-specific cache directory: ${electronCacheDir}`);
}

// Set the environment variable for electron-builder to use
process.env.ELECTRON_BUILDER_CACHE = electronCacheDir;
console.log(`[DEBUG] Set ELECTRON_BUILDER_CACHE to: ${electronCacheDir}`);

// This will help avoid cache corruption by ensuring a clean state
try {
  console.log(`[DEBUG] Cleaning up electron-builder cache at ${electronCacheDir}`);
  // Clean up the electron cache
  const electronDistDir = path.join(electronCacheDir, 'electron');
  if (fs.existsSync(electronDistDir)) {
    fs.rmSync(electronDistDir, { recursive: true, force: true });
    console.log(`[DEBUG] Removed electron dist cache at ${electronDistDir}`);
  }
} catch (error) {
  console.warn(`[DEBUG] Could not clean electron-builder cache: ${error}`);
}

// Check if the output directory exists
const outputDir = path.join(process.cwd(), `out-${currentMode}`);
console.log(`[DEBUG] Output directory: ${outputDir}`);
console.log(`[DEBUG] Output directory exists: ${fs.existsSync(outputDir)}`);

// Create a simple main entry file for electron to start with
// This file will be the entry point in the final application
try {
  // Ensure correct directory structure and paths
  console.log(`[DEBUG] Creating main entry file`);

  // Create a fixed package.json for the app
  const packageJson = {
    name: `zubridge-electron-example-${currentMode}`,
    version: '1.0.0',
    main: 'main/index.js',
    description: `Zubridge Electron Example (${currentMode} mode)`,
    author: 'Zubridge Team',
  };

  // Write the package.json to the output directory
  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  console.log(`[DEBUG] Created package.json with main: ${packageJson.main}`);

  // Check if the renderer index.html exists
  if (fs.existsSync(path.join(outputDir, 'renderer', 'index.html'))) {
    console.log(`[DEBUG] Renderer index.html exists`);
  } else {
    console.log(`[DEBUG] Renderer index.html not found`);
  }

  // Check if the main entry file exists
  if (fs.existsSync(path.join(outputDir, 'main', 'index.js'))) {
    console.log(`[DEBUG] Main entry file exists`);
  } else {
    console.log(`[DEBUG] Main entry file not found`);
  }
} catch (error) {
  console.error(`[DEBUG] Error updating files:`, error);
}

// List files in output directory
try {
  console.log(`[DEBUG] Files in ${outputDir}:`);
  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    console.log(files);

    // Check subdirectories
    ['main', 'preload', 'renderer'].forEach((dir) => {
      const subDir = path.join(outputDir, dir);
      if (fs.existsSync(subDir)) {
        console.log(`[DEBUG] Files in ${dir}:`);
        console.log(fs.readdirSync(subDir));
      }
    });
  } else {
    console.log(`[DEBUG] Output directory does not exist`);
  }
} catch (error) {
  console.error(`[DEBUG] Error checking files:`, error);
}

// Copy resources to the output directory
const resourcesDir = path.join(outputDir, 'resources');
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Create the resources/images directory if it doesn't exist
const imagesDir = path.join(resourcesDir, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Check for tray icon in the repository
const repoTrayIconPath = path.resolve(process.cwd(), '../../resources/trayIcon.png');
const targetTrayIconPath = path.join(resourcesDir, 'trayIcon.png');

// Copy tray icon if it exists
if (fs.existsSync(repoTrayIconPath)) {
  console.log(`[DEBUG] Copying tray icon from ${repoTrayIconPath} to ${targetTrayIconPath}`);
  fs.copyFileSync(repoTrayIconPath, targetTrayIconPath);
} else {
  console.log(`[DEBUG] Tray icon not found at ${repoTrayIconPath}`);
}

const config: Configuration = {
  appId: `com.zubridge.example.${currentMode}`,
  productName: `zubridge-electron-example-${currentMode}`,
  directories: {
    output: `dist-${currentMode}`,
  },
  files: [
    {
      from: `out-${currentMode}`,
      to: './',
      filter: ['**/*'],
    },
  ],
  extraResources: [
    {
      from: `out-${currentMode}/resources`,
      to: './',
    },
  ],
  // Force a new download of Electron for each build to avoid corruption
  electronDist: null,
  electronDownload: {
    // Ensure we use a specific mirror to avoid download issues
    mirror: 'https://github.com/electron/electron/releases/download/',
  },
  asar: true,
  asarUnpack: ['**/*.node'],
  // Set up the app properly
  electronVersion: '35.1.4',
  extraMetadata: {
    main: 'main/index.js',
  },
  mac: {
    target: 'dmg',
  },
  win: {
    target: 'nsis',
  },
  linux: {
    target: 'AppImage',
  },
};

export default config;
