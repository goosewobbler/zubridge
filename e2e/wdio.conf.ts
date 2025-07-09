import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import type { NormalizedPackageJson } from 'read-package-up';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const appDir = process.env.APP_DIR as string; // This should be 'electron-example'
const mode = process.env.MODE || 'basic'; // Default to basic mode if not specified
const appPath = path.join(__dirname, '..', 'apps', appDir); // Path to 'apps/electron-example'
const packageJsonPath = path.join(appPath, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' })) as NormalizedPackageJson;

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
  console.log(`[DEBUG] Looking for macOS binary for mode: ${mode}`);

  // Define possible mac directories to check in priority order
  const macDirs =
    currentArch === 'arm64'
      ? ['mac-arm64', 'mac'] // Prefer arm64 on arm systems
      : ['mac', 'mac-arm64']; // Prefer intel on intel systems

  console.log(`[DEBUG] Will check macOS directories in order: ${macDirs.join(', ')}`);

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

    console.log(`[DEBUG] Checking macOS binary path: ${binPath}`);
    if (fs.existsSync(binPath)) {
      console.log(`[DEBUG] Found macOS binary in ${dir}`);
      return binPath;
    } else {
      console.log(`[DEBUG] Binary not found at: ${binPath}`);
    }
  }

  // Last resort: look for any mac* directory in dist
  const distDir = path.join(appPath, `dist-${mode}`);
  console.log(`[DEBUG] Fallback: scanning dist directory: ${distDir}`);

  if (fs.existsSync(distDir)) {
    console.log(`[DEBUG] Dist directory exists, listing contents...`);
    try {
      const allDirs = fs.readdirSync(distDir);
      console.log(`[DEBUG] All directories in dist: ${allDirs.join(', ')}`);

      const macFolders = allDirs.filter(
        (dir) => dir.startsWith('mac') && fs.statSync(path.join(distDir, dir)).isDirectory(),
      );

      console.log(`[DEBUG] Found mac directories: ${macFolders.join(', ')}`);

      for (const folder of macFolders) {
        const binPath = path.join(
          distDir,
          folder,
          `zubridge-electron-example-${mode}.app`,
          'Contents',
          'MacOS',
          `zubridge-electron-example-${mode}`,
        );

        console.log(`[DEBUG] Checking fallback binary path: ${binPath}`);
        if (fs.existsSync(binPath)) {
          console.log(`[DEBUG] Found binary via fallback in: ${folder}`);
          return binPath;
        }
      }
    } catch (err) {
      console.log(`[DEBUG] Error scanning dist directory: ${err}`);
    }
  } else {
    console.log(`[DEBUG] Dist directory does not exist: ${distDir}`);
  }

  return '';
};

// Platform-specific binary finders
const binaryFinders = {
  darwin: findMacBinary,
  win32: () => {
    const binPath = path.join(appPath, `dist-${mode}`, 'win-unpacked', `zubridge-electron-example-${mode}.exe`);
    console.log(`[DEBUG] Checking Windows binary path: ${binPath}`);
    const exists = fs.existsSync(binPath);
    console.log(`[DEBUG] Windows binary exists: ${exists}`);
    return exists ? binPath : '';
  },
  linux: () => {
    const binPath = path.join(appPath, `dist-${mode}`, 'linux-unpacked', `zubridge-electron-example-${mode}`);
    console.log(`[DEBUG] Checking Linux binary path: ${binPath}`);
    const exists = fs.existsSync(binPath);
    console.log(`[DEBUG] Linux binary exists: ${exists}`);
    return exists ? binPath : '';
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

  console.log(`[DEBUG] Checking electron binary: ${electronBin}`);
  console.log(`[DEBUG] Checking app main: ${appMain}`);
  console.log(`[DEBUG] Electron binary exists: ${fs.existsSync(electronBin)}`);
  console.log(`[DEBUG] App main exists: ${fs.existsSync(appMain)}`);

  if (fs.existsSync(electronBin) && fs.existsSync(appMain)) {
    binaryPath = electronBin;
    process.env.ELECTRON_APP_PATH = appMain;
    console.log(`[DEBUG] Using electron binary with main script: ${appMain}`);
  } else {
    console.error(`[ERROR] No suitable binary found for platform ${currentPlatform}`);

    // Additional debugging: check what files actually exist
    const outDir = path.join(appPath, `out-${mode}`);
    console.log(`[DEBUG] Checking out directory: ${outDir}`);
    if (fs.existsSync(outDir)) {
      try {
        const outContents = fs.readdirSync(outDir);
        console.log(`[DEBUG] Contents of out-${mode}: ${outContents.join(', ')}`);

        const mainDir = path.join(outDir, 'main');
        if (fs.existsSync(mainDir)) {
          const mainContents = fs.readdirSync(mainDir);
          console.log(`[DEBUG] Contents of out-${mode}/main: ${mainContents.join(', ')}`);
        }
      } catch (err) {
        console.log(`[DEBUG] Error listing out directory: ${err}`);
      }
    } else {
      console.log(`[DEBUG] Out directory does not exist: ${outDir}`);
    }
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
    timeout: 30000,
  },
};

// Set up environment
process.env.TEST = 'true'; // General flag for test environment
globalThis.packageJson = packageJson; // Make package.json available if needed in tests

export { config };
