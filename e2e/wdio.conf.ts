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

// Determine which spec files to run based on the mode
let specPattern;
const specificSpecFile = process.env.SPEC_FILE;

if (specificSpecFile) {
  // If a specific spec file is provided, use absolute path
  specPattern = path.resolve(__dirname, 'test', specificSpecFile);
  console.log(`[DEBUG] Running specific spec file: ${specPattern}`);
} else {
  // Use the absolute path to the test directory directly
  // This ensures WebdriverIO gets the correct absolute path on all platforms
  const testDirPath = path.resolve(__dirname, 'test');

  // For macOS and Linux, use a direct glob pattern for all test files
  specPattern = `${testDirPath}/**/*.spec.ts`;

  console.log(`[DEBUG] Using spec pattern: ${specPattern}`);
}

// Get the config that will be exported
const config = {
  services: ['electron'],
  capabilities: [
    {
      'browserName': 'electron',
      'wdio:electronServiceOptions': {
        appBinaryPath: binaryPath,
        appArgs,
        chromeDriverArgs: ['--verbose'],
        appEnv: { ZUBRIDGE_MODE: mode },
        browserVersion: electronVersion,
        restoreMocks: true,
      },
    },
  ],
  maxInstances: 1,
  waitforTimeout: 15000,
  connectionRetryCount: 10,
  connectionRetryTimeout: 30000,
  logLevel: 'debug',
  runner: 'local',
  outputDir: `wdio-logs-${appDir}-${mode}`,
  specs: [specPattern],
  baseUrl: `file://${__dirname}`,
  onPrepare: function (config, capabilities) {
    console.log('[DEBUG] Starting test preparation with WebdriverIO');

    // Log the spec files that will be executed
    console.log('[DEBUG] Spec pattern to be executed:');
    if (Array.isArray(config.specs)) {
      config.specs.forEach((spec, index) => {
        console.log(`[DEBUG] Spec[${index}]: ${spec}`);

        // For specific files (not glob patterns), check if they exist
        if (!spec.includes('*')) {
          const exists = fs.existsSync(spec) ? 'EXISTS' : 'NOT_FOUND';
          console.log(`[DEBUG] File ${spec} ${exists}`);

          if (exists === 'EXISTS') {
            try {
              const stats = fs.statSync(spec);
              console.log(`[DEBUG] Spec file permissions: ${stats.mode.toString(8)}`);
            } catch (err) {
              console.error(`[ERROR] Failed to check permissions for ${spec}:`, err);
            }
          }
        } else {
          console.log(`[DEBUG] Using glob pattern: ${spec}`);

          // For glob patterns, try to list matching files for debugging
          const baseDir = spec.split('*')[0]; // Get directory part before wildcard
          if (fs.existsSync(baseDir)) {
            try {
              console.log(`[DEBUG] Base directory ${baseDir} exists. Contents:`);
              const files = fs.readdirSync(baseDir);
              files.forEach((file) => {
                const fullPath = path.join(baseDir, file);
                const stats = fs.statSync(fullPath);
                console.log(`[DEBUG]   - ${file} (${stats.isDirectory() ? 'dir' : 'file'})`);
              });
            } catch (err) {
              console.error(`[ERROR] Failed to list directory ${baseDir}:`, err);
            }
          } else {
            console.error(`[ERROR] Base directory ${baseDir} does not exist`);
          }
        }
      });
    } else {
      console.log(`[DEBUG] Spec: ${config.specs}`);
    }

    // Check app binary exists and has proper permissions
    if (binaryPath && fs.existsSync(binaryPath)) {
      try {
        const stats = fs.statSync(binaryPath);
        console.log(`[DEBUG] Binary file permissions: ${stats.mode.toString(8)}`);

        // On Linux/Mac, check if binary is executable
        if (process.platform !== 'win32') {
          const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;
          console.log(`[DEBUG] Binary is executable: ${isExecutable}`);

          if (!isExecutable) {
            console.log('[DEBUG] Making binary executable...');
            try {
              fs.chmodSync(binaryPath, stats.mode | fs.constants.S_IXUSR);
              console.log('[DEBUG] Binary made executable');
            } catch (err) {
              console.error('[ERROR] Failed to make binary executable:', err);
            }
          }
        }
      } catch (err) {
        console.error(`[ERROR] Failed to check binary permissions:`, err);
      }
    } else {
      console.error(`[ERROR] Binary path ${binaryPath} does not exist`);
    }
  },
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
