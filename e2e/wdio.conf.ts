import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import type { NormalizedPackageJson } from 'read-package-up';

import { getElectronVersion, getBinaryPath } from '@wdio/electron-utils';

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

// Set the ZUBRIDGE_MODE environment variable to ensure electron-builder.config.ts uses the correct mode
process.env.ZUBRIDGE_MODE = mode;

// Use getBinaryPath to find the binary instead of custom platform-specific logic
let binaryPath = '';

try {
  // Load the actual configuration from electron-builder.config.ts
  console.log(`[DEBUG] Loading electron-builder config for mode: ${mode}`);

  // Import the electron-builder config
  const builderConfigPath = path.join(appPath, 'electron-builder.config.ts');
  console.log(`[DEBUG] Builder config path: ${builderConfigPath}`);

  const builderConfig = await import(builderConfigPath);
  const config = builderConfig.default;

  console.log(`[DEBUG] Loaded builder config with output dir: ${config.directories?.output}`);

  // Create AppBuildInfo for electron-builder
  const appBuildInfo = {
    appName: `zubridge-electron-example-${mode}`,
    config: config,
    isBuilder: true as const,
    isForge: false as const,
  };

  // Get binary path using the real config
  binaryPath = await getBinaryPath(packageJsonPath, appBuildInfo, electronVersion);

  console.log(`[DEBUG] Binary path found by getBinaryPath: ${binaryPath}`);
} catch (err) {
  console.error(`[ERROR] Failed to get binary path: ${err}`);
  throw new Error(`Could not find the electron binary for mode: ${mode}. Error: ${err}`);
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

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, `wdio-logs-${appDir}-${mode}`);
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log(`[DEBUG] Created logs directory: ${logsDir}`);
  }
} catch (e) {
  console.error(`[ERROR] Failed to create logs directory ${logsDir}:`, e);
}

// Platform-specific args
const baseArgs = ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`];

// Add special flags for macOS
if (currentPlatform === 'darwin') {
  baseArgs.push('--disable-dev-shm-usage');
  baseArgs.push('--disable-software-rasterizer');
}

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
  waitforTimeout: 30000, // Increase timeout for macOS builds
  connectionRetryCount: 3,
  connectionRetryTimeout: 60000, // Increase connection retry timeout
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
        if (currentPlatform !== 'win32') {
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
    timeout: 60000, // Increase test timeout for macOS builds
  },
};

// Set up environment
process.env.TEST = 'true'; // General flag for test environment
globalThis.packageJson = packageJson; // Make package.json available if needed in tests

export { config };
