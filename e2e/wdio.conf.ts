import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import type { NormalizedPackageJson } from 'read-package-up';

import { getElectronVersion } from '@wdio/electron-utils';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const appDir = process.env.APP_DIR as string; // This should be 'electron-example'
const mode = process.env.MODE || 'basic'; // Default to basic mode if not specified
const appPath = path.join(__dirname, '..', 'apps', appDir); // Path to 'apps/electron-example'
const packageJsonPath = path.join(appPath, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' })) as NormalizedPackageJson;
const pkg = { packageJson, path: packageJsonPath };
const electronVersion = await getElectronVersion(pkg);

console.log(`[DEBUG] Running on platform: ${process.platform}`);
console.log(`[DEBUG] APP_DIR: ${appDir}, MODE: ${mode}`);
console.log(`[DEBUG] packageJsonPath: ${packageJsonPath}`);
console.log(`[DEBUG] appPath (base for dist): ${appPath}`);

let binaryPath = '';
const currentPlatform = process.platform;

const platformSpecificAppPaths = {
  darwin: path.join(
    appPath, // apps/electron-example
    `dist-${mode}`,
    'mac', // Electron builder often uses 'mac' or 'mac-arm64' etc. Let's assume 'mac' for now or check artifact structure.
    `zubridge-electron-example-${mode}.app`,
    'Contents',
    'MacOS',
    `zubridge-electron-example-${mode}`,
  ),
  win32: path.join(appPath, `dist-${mode}`, 'win-unpacked', `zubridge-electron-example-${mode}.exe`),
  linux: path.join(appPath, `dist-${mode}`, 'linux-unpacked', `zubridge-electron-example-${mode}`),
};

// Log the paths we're about to check
console.log(`[DEBUG] Expected Darwin (macOS) path: ${platformSpecificAppPaths.darwin}`);
console.log(`[DEBUG] Expected Windows path: ${platformSpecificAppPaths.win32}`);
console.log(`[DEBUG] Expected Linux path: ${platformSpecificAppPaths.linux}`);

if (currentPlatform === 'darwin') {
  if (fs.existsSync(platformSpecificAppPaths.darwin)) {
    binaryPath = platformSpecificAppPaths.darwin;
    console.log(`[DEBUG] Using Darwin (macOS) binary: ${binaryPath}`);
  } else {
    // Attempt a common alternative for arm64 if the primary 'mac' doesn't exist
    const arm64MacPath = path.join(
      appPath,
      `dist-${mode}`,
      'mac-arm64', // Common for arm64 builds
      `zubridge-electron-example-${mode}.app`,
      'Contents',
      'MacOS',
      `zubridge-electron-example-${mode}`,
    );
    console.log(`[DEBUG] Darwin (macOS) primary path not found, checking arm64 path: ${arm64MacPath}`);
    if (fs.existsSync(arm64MacPath)) {
      binaryPath = arm64MacPath;
      console.log(`[DEBUG] Using Darwin (macOS) arm64 binary: ${binaryPath}`);
    } else {
      console.warn(`[WARN] Darwin (macOS) binary not found at expected paths.`);
    }
  }
} else if (currentPlatform === 'win32') {
  if (fs.existsSync(platformSpecificAppPaths.win32)) {
    binaryPath = platformSpecificAppPaths.win32;
    console.log(`[DEBUG] Using Windows binary: ${binaryPath}`);
  } else {
    console.warn(`[WARN] Windows binary not found at ${platformSpecificAppPaths.win32}`);
  }
} else if (currentPlatform === 'linux') {
  if (fs.existsSync(platformSpecificAppPaths.linux)) {
    binaryPath = platformSpecificAppPaths.linux;
    console.log(`[DEBUG] Using Linux binary: ${binaryPath}`);
  } else {
    console.warn(`[WARN] Linux binary not found at ${platformSpecificAppPaths.linux}`);
  }
}

if (!binaryPath) {
  console.log('[DEBUG] No platform-specific binary found, attempting fallback to direct Electron execution.');
  const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  const appMain = path.join(appPath, `out-${mode}`, 'main', 'index.js'); // Assumes 'out-${mode}' for non-packaged builds

  if (fs.existsSync(electronBin) && fs.existsSync(appMain)) {
    binaryPath = electronBin;
    process.env.ELECTRON_APP_PATH = appMain; // Critical for wdio-electron-service when using electron directly
    console.log(`[DEBUG] Fallback: Using electron binary: ${electronBin} with main script: ${appMain}`);
  } else {
    console.error(
      `[ERROR] No suitable binary found for platform ${currentPlatform} and fallback also failed. electronBin: ${electronBin} (exists: ${fs.existsSync(electronBin)}), appMain: ${appMain} (exists: ${fs.existsSync(appMain)})`,
    );
    // Consider throwing an error here if tests cannot proceed without a binary
  }
}

// Generate a unique user data directory
const userDataDir = path.join(__dirname, `.electron-user-data-${mode}-${Date.now()}`);
try {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  console.log(`[DEBUG] Using user data directory: ${userDataDir}`);
} catch (e) {
  console.error(`[ERROR] Failed to create user data directory ${userDataDir}:`, e);
  // Fallback or rethrow if this is critical
}

const baseArgs = ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`];
const appArgs = process.env.ELECTRON_APP_PATH ? [process.env.ELECTRON_APP_PATH, ...baseArgs] : baseArgs;

// Get the config that will be exported
const config = {
  services: ['electron'],
  capabilities: [
    {
      'browserName': 'electron', // Should be 'electron' for wdio-electron-service
      'wdio:electronServiceOptions': {
        appBinaryPath: binaryPath,
        appArgs,
        chromeDriverArgs: ['--verbose'], // Useful for debugging ChromeDriver issues
        appEnv: { ZUBRIDGE_MODE: mode },
        browserVersion: electronVersion, // Ensures compatibility
        restoreMocks: true,
      },
      // It's often better to put chromeOptions specific to Electron under 'goog:chromeOptions'
      // but wdio-electron-service primarily uses its own options.
      // If also testing web directly, separate capabilities would be needed.
    },
  ],
  maxInstances: 1,
  waitforTimeout: 15000,
  connectionRetryCount: 10,
  connectionRetryTimeout: 30000,
  logLevel: 'debug',
  runner: 'local',
  outputDir: `wdio-logs-electron-${mode}`, // Unique log directory per mode
  specs: ['./test/*.spec.ts'],
  tsConfigPath: path.join(__dirname, 'tsconfig.json'),
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 30000,
  },
};

// Set up environment
process.env.TEST = 'true'; // General flag for test environment
globalThis.packageJson = packageJson; // Make package.json available if needed in tests

export { config };
