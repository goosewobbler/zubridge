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
console.log(`[DEBUG] Electron version: ${electronVersion}`);

// Set the ZUBRIDGE_MODE environment variable to ensure electron-builder.config.ts uses the correct mode
process.env.ZUBRIDGE_MODE = mode;
console.log(`[DEBUG] Set ZUBRIDGE_MODE to: ${process.env.ZUBRIDGE_MODE}`);

// Use getBinaryPath to find the binary instead of custom platform-specific logic
let binaryPath = '';

// Explicitly define the output directory based on mode
const outputDir = `dist-${mode}`;
console.log(`[DEBUG] Expected output directory: ${outputDir}`);

// Add a function to list directory contents with depth limit
function listDirectoryContents(dirPath: string, indent = 0, maxDepth = 2, currentDepth = 0) {
  if (!fs.existsSync(dirPath)) {
    console.log(`${' '.repeat(indent)}[DEBUG] Directory does not exist: ${dirPath}`);
    return;
  }

  // Stop recursion if we've reached max depth
  if (currentDepth > maxDepth) {
    console.log(`${' '.repeat(indent)}[DEBUG] Max depth reached at: ${dirPath}`);
    return;
  }

  console.log(`${' '.repeat(indent)}[DEBUG] Contents of ${dirPath}:`);
  const items = fs.readdirSync(dirPath);

  // Limit the number of items shown per directory
  const maxItems = 20;
  const displayItems = items.length > maxItems ? items.slice(0, maxItems) : items;

  if (items.length > maxItems) {
    console.log(`${' '.repeat(indent + 2)}[DEBUG] Showing ${maxItems} of ${items.length} items...`);
  }

  for (const item of displayItems) {
    const itemPath = path.join(dirPath, item);
    try {
      const stats = fs.statSync(itemPath);
      const itemType = stats.isDirectory() ? 'Directory' : 'File';
      const size = stats.isFile() ? `(${stats.size} bytes)` : '';
      console.log(`${' '.repeat(indent + 2)}[DEBUG] ${itemType}: ${item} ${size}`);

      if (stats.isDirectory()) {
        listDirectoryContents(itemPath, indent + 4, maxDepth, currentDepth + 1);
      }
    } catch (err) {
      console.log(`${' '.repeat(indent + 2)}[DEBUG] Error reading item ${itemPath}: ${err}`);
    }
  }
}

// Function to directly find the macOS binary based on the architecture
function findMacOSBinary() {
  if (currentPlatform !== 'darwin') return null;

  const fullOutputPath = path.join(appPath, outputDir);
  if (!fs.existsSync(fullOutputPath)) return null;

  // Determine architecture-specific directory
  if (currentArch === 'arm64') {
    // Check mac-arm64 directory first
    const arm64Path = path.join(fullOutputPath, 'mac-arm64');
    if (fs.existsSync(arm64Path)) {
      const appName = `zubridge-electron-example-${mode}.app`;
      const appPath = path.join(arm64Path, appName);
      if (fs.existsSync(appPath)) {
        const binaryPath = path.join(appPath, 'Contents', 'MacOS', `zubridge-electron-example-${mode}`);
        if (fs.existsSync(binaryPath)) return binaryPath;
      }
    }

    // Fallback to other possible directories
    const fallbackDirs = ['mac', 'mac-universal'];
    for (const dir of fallbackDirs) {
      const dirPath = path.join(fullOutputPath, dir);
      if (fs.existsSync(dirPath)) {
        const appName = `zubridge-electron-example-${mode}.app`;
        const appPath = path.join(dirPath, appName);
        if (fs.existsSync(appPath)) {
          const binaryPath = path.join(appPath, 'Contents', 'MacOS', `zubridge-electron-example-${mode}`);
          if (fs.existsSync(binaryPath)) return binaryPath;
        }
      }
    }
  }

  return null;
}

try {
  // Create a builder config manually - simpler and more reliable than importing
  console.log(`[DEBUG] Creating builder config for mode: ${mode}`);

  // List contents of the output directory at a limited depth
  const fullOutputPath = path.join(appPath, outputDir);
  console.log(`[DEBUG] Checking expected output directory: ${fullOutputPath}`);
  listDirectoryContents(fullOutputPath, 0, 2);

  const config = {
    appId: `com.zubridge.example.${mode}`,
    productName: `zubridge-electron-example-${mode}`,
    directories: {
      output: outputDir,
    },
  };

  // Log the config we're using
  console.log(`[DEBUG] Builder config:`, JSON.stringify(config, null, 2));

  // Create AppBuildInfo for electron-builder
  const appBuildInfo = {
    appName: `zubridge-electron-example-${mode}`,
    config: config,
    isBuilder: true as const,
    isForge: false as const,
  };

  // Log the appBuildInfo being passed to getBinaryPath
  console.log(`[DEBUG] AppBuildInfo for getBinaryPath:`, JSON.stringify(appBuildInfo, null, 2));
  console.log(`[DEBUG] PackageJsonPath: ${packageJsonPath}`);

  // Try to get binary path using the config
  try {
    binaryPath = await getBinaryPath(packageJsonPath, appBuildInfo, electronVersion);
    console.log(`[DEBUG] Binary path found by getBinaryPath: ${binaryPath}`);
  } catch (err) {
    console.log(`[DEBUG] getBinaryPath failed, trying direct detection: ${err}`);

    // If getBinaryPath fails, fall back to direct detection for macOS
    if (currentPlatform === 'darwin') {
      const macBinary = findMacOSBinary();
      if (macBinary) {
        console.log(`[DEBUG] Found macOS binary directly: ${macBinary}`);
        binaryPath = macBinary;
      } else {
        throw new Error(`Failed to find binary using both getBinaryPath and direct detection`);
      }
    } else {
      // Re-throw on non-macOS platforms
      throw err;
    }
  }

  console.log(`[DEBUG] Binary exists: ${fs.existsSync(binaryPath)}`);

  if (fs.existsSync(binaryPath)) {
    const stats = fs.statSync(binaryPath);
    console.log(`[DEBUG] Binary file size: ${stats.size} bytes`);
    console.log(`[DEBUG] Binary file permissions: ${stats.mode.toString(8)}`);
    console.log(`[DEBUG] Binary is executable: ${(stats.mode & fs.constants.S_IXUSR) !== 0}`);
  }
} catch (err) {
  console.error(`[ERROR] Failed to get binary path: ${err}`);

  // Log more details about the error
  if (err instanceof Error) {
    console.error(`[ERROR] Stack trace: ${err.stack}`);
  }

  // Check if the dist directory without mode suffix exists (common fallback)
  const fallbackOutputDir = 'dist';
  const fallbackOutputPath = path.join(appPath, fallbackOutputDir);
  if (fs.existsSync(fallbackOutputPath)) {
    console.log(`[DEBUG] Fallback output directory exists: ${fallbackOutputPath}`);
    console.log(`[DEBUG] Listing contents of fallback directory:`);
    listDirectoryContents(fallbackOutputPath, 0, 1);
  }

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
