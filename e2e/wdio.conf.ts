import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';

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

const currentPlatform = process.platform;
const currentArch = process.arch;

console.log(`[DEBUG] Running on platform: ${currentPlatform}`);
console.log(`[DEBUG] APP_DIR: ${appDir}, MODE: ${mode}`);
console.log(`[DEBUG] packageJsonPath: ${packageJsonPath}`);
console.log(`[DEBUG] appPath (base for dist): ${appPath}`);
console.log(`[DEBUG] Running on architecture: ${currentArch}`);

// Find binary path for current platform
let binaryPath = '';

// Define possible binary locations with architecture-aware paths
const findMacBinary = () => {
  // Define possible mac directories to check in priority order
  const macDirs =
    currentArch === 'arm64'
      ? ['mac-arm64', 'mac'] // Prefer arm64 on arm systems
      : ['mac', 'mac-arm64']; // Prefer intel on intel systems

  // Try each directory in order
  for (const dir of macDirs) {
    const binPath = path.join(
      appPath,
      `dist-${mode}`,
      dir,
      `zubridge-electron-example-${mode}.app`,
      'Contents',
      'MacOS',
      `zubridge-electron-example-${mode}`,
    );

    if (fs.existsSync(binPath)) {
      console.log(`[DEBUG] Found macOS binary in ${dir}`);
      return binPath;
    }
  }

  // Last resort: look for any mac* directory in dist
  const distDir = path.join(appPath, `dist-${mode}`);
  if (fs.existsSync(distDir)) {
    try {
      const macFolders = fs
        .readdirSync(distDir)
        .filter((dir) => dir.startsWith('mac') && fs.statSync(path.join(distDir, dir)).isDirectory());

      for (const folder of macFolders) {
        const binPath = path.join(
          distDir,
          folder,
          `zubridge-electron-example-${mode}.app`,
          'Contents',
          'MacOS',
          `zubridge-electron-example-${mode}`,
        );

        if (fs.existsSync(binPath)) {
          return binPath;
        }
      }
    } catch (err) {
      /* ignore errors during directory scan */
    }
  }

  return '';
};

// Platform-specific binary finders
const binaryFinders = {
  darwin: findMacBinary,
  win32: () => {
    const binPath = path.join(appPath, `dist-${mode}`, 'win-unpacked', `zubridge-electron-example-${mode}.exe`);
    return fs.existsSync(binPath) ? binPath : '';
  },
  linux: () => {
    const binPath = path.join(appPath, `dist-${mode}`, 'linux-unpacked', `zubridge-electron-example-${mode}`);
    return fs.existsSync(binPath) ? binPath : '';
  },
};

// Find binary for current platform
if (binaryFinders[currentPlatform]) {
  binaryPath = binaryFinders[currentPlatform]();
  if (binaryPath) {
    console.log(`[DEBUG] Using ${currentPlatform} binary: ${binaryPath}`);
  } else {
    console.log(`[DEBUG] No platform-specific binary found for ${currentPlatform}, will try fallback`);
  }
}

// Fallback to direct Electron execution if no binary found
if (!binaryPath) {
  console.log('[DEBUG] Attempting fallback to direct Electron execution');
  const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  const appMain = path.join(appPath, `out-${mode}`, 'main', 'index.js');

  if (fs.existsSync(electronBin) && fs.existsSync(appMain)) {
    binaryPath = electronBin;
    process.env.ELECTRON_APP_PATH = appMain;
    console.log(`[DEBUG] Using electron binary with main script: ${appMain}`);
  } else {
    console.error(`[ERROR] No suitable binary found for platform ${currentPlatform}`);
  }
}

// Fix for macOS: Ensure the binary is always executable before running tests
if (currentPlatform === 'darwin' && binaryPath && fs.existsSync(binaryPath)) {
  try {
    const stats = fs.statSync(binaryPath);
    const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;
    if (!isExecutable) {
      console.log('[DEBUG] Making macOS binary executable...');
      fs.chmodSync(binaryPath, stats.mode | fs.constants.S_IXUSR);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to check/fix binary permissions: ${err}`);
  }
}

// Function to clean up old user data directories
function cleanupOldUserDataDirs() {
  try {
    const e2eDir = __dirname;
    const dirEntries = fs.readdirSync(e2eDir);
    const userDataDirPattern = new RegExp(`^\\.electron-user-data-${mode}-.*$`);

    let cleanedCount = 0;
    for (const entry of dirEntries) {
      if (userDataDirPattern.test(entry)) {
        const fullPath = path.join(e2eDir, entry);
        try {
          // Check if the directory is old (more than 1 hour)
          const stats = fs.statSync(fullPath);
          const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

          if (ageInHours > 1) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleanedCount++;
          }
        } catch (e) {
          console.log(`[DEBUG] Error cleaning up directory ${fullPath}: ${e}`);
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[DEBUG] Cleaned up ${cleanedCount} old user data directories`);
    }
  } catch (e) {
    console.error(`[ERROR] Failed to clean up old user data directories: ${e}`);
  }
}

// Clean up old user data directories before starting
cleanupOldUserDataDirs();

// Base directory for user data - we won't create actual directories here,
// this is just for constructing unique paths later
const userDataDirBase = path.join(__dirname, `.electron-user-data-${mode}-${Date.now()}`);
console.log(`[DEBUG] User data directory base: ${userDataDirBase}`);

// Additional flags for better stability across all platforms
const stabilityFlags = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-extensions',
  '--disable-popup-blocking',
  '--remote-debugging-port=9222',
];

const baseArgs = stabilityFlags;

// Note: The actual user data dir will be populated with worker ID in capabilities
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
        appEnv: {
          ZUBRIDGE_MODE: mode,
          ELECTRON_ENABLE_LOGGING: '1',
          ELECTRON_ENABLE_STACK_DUMPING: '1',
          NODE_ENV: 'test',
        },
        browserVersion: electronVersion,
        restoreMocks: true,
        electronStdio: 'inherit', // See stdout/stderr from Electron process
      },
    },
  ],
  maxInstances: 1, // Run one test at a time for stability
  waitforTimeout: 60000,
  connectionRetryCount: 3,
  connectionRetryTimeout: 60000,
  logLevel: 'debug',
  runner: 'local',
  outputDir: `wdio-logs-${mode}`,
  specs: [specPattern],
  baseUrl: `file://${__dirname}`,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
    bail: true,
  },

  // Hook to clean quarantine attribute on macOS
  onPrepare: function () {
    console.log('[DEBUG] Starting test preparation with WebdriverIO');

    // On macOS, remove the quarantine attribute which can prevent execution
    if (process.platform === 'darwin') {
      try {
        console.log('[DEBUG] Removing quarantine attribute from macOS app bundle');
        // xattr -r -d com.apple.quarantine /path/to/app.app
        execSync(`xattr -r -d com.apple.quarantine ${binaryPath}`, { stdio: 'pipe' });
        console.log('[DEBUG] Quarantine removal complete');
      } catch (error) {
        console.log('[DEBUG] Error removing quarantine attribute:', error);
      }
    }

    // Display spec pattern and available tests
    console.log('[DEBUG] Spec pattern to be executed:');
    console.log(`[DEBUG] Spec[0]: ${specPattern}`);

    // Display info about the binary
    try {
      console.log(`[DEBUG] Using glob pattern: ${specPattern}`);
      const testDir = path.join(__dirname, 'test');
      if (fs.existsSync(testDir)) {
        console.log(`[DEBUG] Base directory ${testDir} exists. Contents:`);
        const files = fs.readdirSync(testDir);
        files.forEach((file) => {
          const stats = fs.statSync(path.join(testDir, file));
          console.log(`[DEBUG]   - ${file} (${stats.isDirectory() ? 'directory' : 'file'})`);
        });
      }

      const binaryStats = fs.statSync(binaryPath);
      const octalPermissions = '1' + (binaryStats.mode & parseInt('777', 8)).toString(8);
      console.log(`[DEBUG] Binary file permissions: ${octalPermissions}`);
      // Check if executable
      console.log(`[DEBUG] Binary is executable: ${(binaryStats.mode & fs.constants.S_IXUSR) !== 0}`);

      // Ensure the binary is executable
      if ((binaryStats.mode & fs.constants.S_IXUSR) === 0) {
        fs.chmodSync(binaryPath, binaryStats.mode | fs.constants.S_IXUSR);
        console.log('[DEBUG] Making macOS binary executable...');
      }
    } catch (error) {
      console.error('[DEBUG] Error checking app binary:', error);
    }
  },

  // Simple logging for test lifecycle
  beforeTest: function (test) {
    console.log(`[TEST START] Starting test: "${test.title}" in ${test.file}`);
  },

  afterTest: function (test, context, { error }) {
    if (error) {
      console.log('--------------- TEST FAILURE ---------------');
      console.log(`Test: ${test.title}`);
      console.log(`Error: ${error.message}`);
      console.log(`Stack: ${error.stack}`);
      console.log('-------------------------------------------');
    }
  },
};

// Set up environment
process.env.TEST = 'true'; // General flag for test environment
globalThis.packageJson = packageJson; // Make package.json available if needed in tests

export { config };
