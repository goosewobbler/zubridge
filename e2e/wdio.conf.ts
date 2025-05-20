import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
// import crypto from 'node:crypto'; // Not used
// import os from 'node:os'; // Not used

import type { NormalizedPackageJson } from 'read-package-up';
// import type { Options } from '@wdio/types'; // Kept as any for now

import { getElectronVersion } from '@wdio/electron-utils';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Determine app type and path from environment variables
const e2eAppType = process.env.E2E_APP_TYPE || 'electron'; // Default to electron
const appPathFromEnv = process.env.APP_PATH; // Provided by GH Actions for packaged apps

const appDir = process.env.APP_DIR as string; // e.g., 'electron-example', 'tauri-example'
const mode = process.env.MODE || 'basic';

console.log(`[DEBUG] E2E_APP_TYPE: ${e2eAppType}`);
console.log(`[DEBUG] APP_PATH (from env): ${appPathFromEnv}`);
console.log(`[DEBUG] APP_DIR (for fallback/electron dev): ${appDir}`);
console.log(`[DEBUG] MODE: ${mode}`);

console.log(`[DEBUG] wdio.conf.ts: Initial process.env.APP_PATH = "${process.env.APP_PATH}"`);
console.log(`[DEBUG] wdio.conf.ts: Initial process.env.E2E_APP_TYPE = "${process.env.E2E_APP_TYPE}"`);
console.log(`[DEBUG] wdio.conf.ts: Initial process.env.APP_DIR = "${process.env.APP_DIR}"`);
console.log(`[DEBUG] wdio.conf.ts: Initial process.env.MODE = "${process.env.MODE}"`);

let binaryPath: string | undefined; // This will be the final path used by the service
let resolvedAppPathFromEnv: string | undefined; // Store APP_PATH if valid, for later specific handling
let services: string[] = [];
let capabilities: any[] = [];
let beforeSessionHook: (() => void) | undefined = undefined;
let afterSessionHook: (() => void) | undefined = undefined;
let onPrepareHook: (() => void) | undefined = undefined;
let framework: string | undefined = undefined;
let reporters: string[] | undefined = undefined;

// keep track of the `tauri-driver` child process
let tauriDriver: ChildProcess | undefined;

const currentPlatform = process.platform;
const currentArch = process.arch;

// Define stabilityFlags early as they are used in Electron serviceOptions
const stabilityFlags = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-extensions',
  '--disable-popup-blocking',
  '--remote-debugging-port=9222',
];

if (appPathFromEnv) {
  const absoluteAppPath = path.resolve(__dirname, '..', appPathFromEnv);
  console.log(`[DEBUG] APP_PATH from env: "${appPathFromEnv}", resolved to absolute: "${absoluteAppPath}"`);
  // Trust that if APP_PATH is provided by CI (via setup-e2e-environment), it's valid.
  // The setup-e2e-environment action is responsible for verifying existence.
  resolvedAppPathFromEnv = absoluteAppPath;
  console.log(`[DEBUG] Assuming resolved APP_PATH from env is valid: "${resolvedAppPathFromEnv}"`);
} else {
  console.log('[DEBUG] APP_PATH (from env) is not set. Fallback will be attempted.');
}

if (e2eAppType.startsWith('tauri')) {
  if (resolvedAppPathFromEnv) {
    // APP_PATH was provided and valid
    binaryPath = resolvedAppPathFromEnv;
    console.log(`[DEBUG] Tauri: Using binaryPath from resolved APP_PATH: ${binaryPath}`);
  } else {
    // Fallback logic for Tauri if APP_PATH wasn't helpful
    console.log(`[DEBUG] Tauri: APP_PATH not set or invalid. Attempting to find local dev build.`);
    const tauriAppBaseDir = path.join(__dirname, '..', 'apps', appDir);
    const bundleDir = path.join(tauriAppBaseDir, 'src-tauri', 'target', 'release', 'bundle');
    let foundPath: string | undefined;

    if (fs.existsSync(bundleDir)) {
      if (currentPlatform === 'linux') {
        const appimageDir = path.join(bundleDir, 'appimage');
        if (fs.existsSync(appimageDir)) {
          const files = fs.readdirSync(appimageDir).filter((f) => f.endsWith('.AppImage'));
          if (files.length > 0) {
            files.sort(
              (a, b) => fs.statSync(path.join(appimageDir, b)).mtimeMs - fs.statSync(path.join(appimageDir, a)).mtimeMs,
            );
            foundPath = path.join(appimageDir, files[0]);
          }
        }
      } else if (currentPlatform === 'win32') {
        const nsisDir = path.join(bundleDir, 'nsis');
        const msiDir = path.join(bundleDir, 'msi');
        let exeFiles: string[] = [];
        if (fs.existsSync(nsisDir)) {
          exeFiles = fs.readdirSync(nsisDir).filter((f) => f.endsWith('.exe'));
          if (exeFiles.length > 0) {
            exeFiles.sort(
              (a, b) => fs.statSync(path.join(nsisDir, b)).mtimeMs - fs.statSync(path.join(nsisDir, a)).mtimeMs,
            );
            foundPath = path.join(nsisDir, exeFiles[0]);
          }
        }
        if (!foundPath && fs.existsSync(msiDir)) {
          const msiFiles = fs.readdirSync(msiDir).filter((f) => f.endsWith('.msi'));
          if (msiFiles.length > 0) {
            msiFiles.sort(
              (a, b) => fs.statSync(path.join(msiDir, b)).mtimeMs - fs.statSync(path.join(msiDir, a)).mtimeMs,
            );
            foundPath = path.join(msiDir, msiFiles[0]);
            console.log('[INFO] Tauri: Found MSI. Note: E2E test might not run MSI directly.');
          }
        }
      } // macOS for Tauri is disabled in CI, local usage would require manual APP_PATH or .app handling.
    }

    if (foundPath && fs.existsSync(foundPath)) {
      binaryPath = foundPath;
      console.log(`[DEBUG] Tauri: Auto-discovered local build: ${binaryPath}`);
    } else {
      console.error(`[ERROR] Tauri: APP_PATH not set and local build not found in expected location: ${bundleDir}`);
      process.exit(1);
    }
  }
  console.log(`[DEBUG] Using Tauri binary from (final path): ${binaryPath}`);
  // Ensure executable for non-Windows
  if (currentPlatform !== 'win32') {
    try {
      fs.chmodSync(binaryPath, '755');
      console.log(`[DEBUG] Made Tauri binary executable: ${binaryPath}`);
    } catch (err) {
      console.error(`[ERROR] Failed to chmod Tauri binary: ${err}`);
    }
  }

  capabilities = [
    {
      'maxInstances': 1,
      'browserName': 'chrome', // Or wry, depending on what tauri-driver expects/reports
      'tauri:options': {
        application: binaryPath,
      },
    },
  ];

  framework = 'mocha';
  reporters = ['spec'];

  // ensure we are running `tauri-driver` before the session starts
  beforeSessionHook = () => {
    const driverPath = path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver');
    console.log(`[DEBUG] Attempting to spawn tauri-driver from: ${driverPath}`);
    tauriDriver = spawn(driverPath, [], { stdio: [null, process.stdout, process.stderr] });
    if (tauriDriver.pid) {
      console.log(`[DEBUG] tauri-driver spawned successfully with PID: ${tauriDriver.pid}`);
    } else {
      console.error(
        `[ERROR] Failed to spawn tauri-driver at ${driverPath}. Ensure it is installed and in PATH or ~/.cargo/bin.`,
      );
      // Attempt to find it in PATH if home dir fails
      try {
        const driverPathInPath = execSync('command -v tauri-driver').toString().trim();
        console.log(`[DEBUG] Found tauri-driver in PATH: ${driverPathInPath}`);
        tauriDriver = spawn(driverPathInPath, [], { stdio: [null, process.stdout, process.stderr] });
        if (!tauriDriver.pid) throw new Error('Still failed to spawn from PATH');
        console.log(`[DEBUG] tauri-driver spawned successfully from PATH with PID: ${tauriDriver.pid}`);
      } catch (pathError) {
        console.error(`[ERROR] tauri-driver not found in PATH either. Error: ${pathError}`);
        process.exit(1); // Exit if driver can't be started
      }
    }
  };

  // clean up the `tauri-driver` process
  afterSessionHook = () => {
    if (tauriDriver) {
      console.log(`[DEBUG] Killing tauri-driver process (PID: ${tauriDriver.pid})`);
      tauriDriver.kill();
    }
  };

  // For Tauri, the app is already built by CI, so onPrepare is mainly for macOS quarantine
  onPrepareHook = () => {
    if (currentPlatform === 'darwin' && binaryPath && fs.existsSync(binaryPath)) {
      try {
        console.log('[DEBUG] Removing quarantine attribute from macOS Tauri app/dmg');
        execSync(`xattr -r -d com.apple.quarantine "${binaryPath}"`, { stdio: 'pipe' });
      } catch (error) {
        console.warn('[WARN] Error removing quarantine for Tauri app:', error);
      }
    }
  };
} else {
  // Electron app
  services = ['electron'];
  framework = 'mocha'; // Set framework to mocha for Electron as well
  // Reporters will remain undefined for Electron to use defaults

  const electronExampleAppPath = path.join(__dirname, '..', 'apps', appDir || 'electron-example');
  const packageJsonPath = path.join(electronExampleAppPath, 'package.json');
  let electronAppVersion: string | undefined;

  if (fs.existsSync(packageJsonPath)) {
    const packageJsonFile = JSON.parse(
      fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }),
    ) as NormalizedPackageJson;
    const pkg = { packageJson: packageJsonFile, path: packageJsonPath };
    electronAppVersion = await getElectronVersion(pkg);
  } else {
    console.warn(`[WARN] package.json not found at ${packageJsonPath} for Electron version retrieval.`);
  }

  if (resolvedAppPathFromEnv) {
    console.log(`[DEBUG] Electron: Attempting to use resolved APP_PATH: ${resolvedAppPathFromEnv}`);
    if (currentPlatform === 'darwin' && resolvedAppPathFromEnv.endsWith('.app')) {
      const executableName = `zubridge-${appDir}-${mode}`; // appDir and mode from env
      const internalExecutable = path.join(resolvedAppPathFromEnv, 'Contents', 'MacOS', executableName);
      if (fs.existsSync(internalExecutable)) {
        console.log(`[DEBUG] Electron macOS: APP_PATH is .app, using internal executable: "${internalExecutable}"`);
        binaryPath = internalExecutable;
      } else {
        console.warn(
          `[WARN] Electron macOS: Internal executable "${executableName}" not found inside .app bundle "${resolvedAppPathFromEnv}". Will attempt full fallback.`,
        );
      }
    } else {
      // For non-macOS .app cases (e.g. Linux executable, Windows .exe from APP_PATH)
      binaryPath = resolvedAppPathFromEnv;
      console.log(`[DEBUG] Electron: Using binaryPath from resolved APP_PATH (non-macOS.app): ${binaryPath}`);
    }
  }

  // Fallback logic for Electron if binaryPath was not successfully determined from APP_PATH
  if (!binaryPath) {
    console.log('[DEBUG] Electron: binaryPath not set from APP_PATH. Using full fallback discovery.');
    const electronExampleAppPath = path.join(__dirname, '..', 'apps', appDir || 'electron-example'); // Use appDir from env if available
    const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
    const appMain = path.join(electronExampleAppPath, `out-${mode}`, 'main', 'index.js');
    if (fs.existsSync(electronBin) && fs.existsSync(appMain)) {
      binaryPath = electronBin; // This is the electron executable itself
      process.env.ELECTRON_APP_PATH = appMain; // The service will use this to load the app
      console.log(`[DEBUG] Electron: Using electron binary ${binaryPath} with main script: ${appMain}`);
    } else {
      console.error(
        `[ERROR] Electron: No suitable binary or main script found for dev execution on platform ${currentPlatform}`,
      );
      process.exit(1);
    }
  }

  console.log(`[DEBUG] Electron: Final binary/executable path: ${binaryPath}`);
  if (
    currentPlatform === 'darwin' &&
    fs.existsSync(binaryPath) &&
    binaryPath.endsWith('.app/Contents/MacOS/' + `zubridge-electron-example-${mode}`)
  ) {
    try {
      const stats = fs.statSync(binaryPath);
      if (!((stats.mode & fs.constants.S_IXUSR) !== 0)) {
        fs.chmodSync(binaryPath, stats.mode | fs.constants.S_IXUSR);
      }
    } catch (err) {
      /* ignore */
    }
  } else if (currentPlatform === 'darwin' && binaryPath.endsWith('.app')) {
    // If APP_PATH points to the .app bundle
    // The service will handle the .app bundle directly.
    // Quarantine removal for electron .app bundle is handled in onPrepare.
  }

  const electronServiceOptions: any = {
    appBinaryPath: binaryPath, // Can be the app itself or the electron executable
    appArgs: process.env.ELECTRON_APP_PATH ? [process.env.ELECTRON_APP_PATH, ...stabilityFlags] : stabilityFlags,
    chromeDriverArgs: ['--verbose', '--disable-dev-shm-usage'],
    chromeDriverLogPath: path.join(__dirname, `wdio-chromedriver-${e2eAppType}-${mode}.log`),
    appEnv: {
      ZUBRIDGE_MODE: mode,
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_ENABLE_STACK_DUMPING: '1',
      NODE_ENV: 'test',
    },
    browserVersion: electronAppVersion,
    restoreMocks: true,
  };

  capabilities = [
    {
      'browserName': 'electron',
      'wdio:electronServiceOptions': electronServiceOptions,
    },
  ];

  onPrepareHook = () => {
    if (currentPlatform === 'darwin' && binaryPath && binaryPath.includes('.app/Contents/MacOS/')) {
      // If binaryPath is already the internal executable, we need to find the .app bundle path
      const appBundlePath = binaryPath.substring(0, binaryPath.indexOf('.app') + 4);
      console.log(`[DEBUG] onPrepare Electron macOS: appBinaryPath is internal, derived .app bundle: ${appBundlePath}`);
      if (fs.existsSync(appBundlePath)) {
        try {
          console.log(
            `[DEBUG] onPrepare Electron macOS: Removing quarantine attribute from app bundle: "${appBundlePath}"`,
          );
          execSync(`xattr -r -d com.apple.quarantine "${appBundlePath}"`, { stdio: 'pipe' });
          console.log(`[DEBUG] onPrepare Electron macOS: Quarantine removal command executed for "${appBundlePath}".`);
        } catch (error) {
          console.warn(
            `[WARN] onPrepare Electron macOS: Error removing quarantine for app bundle "${appBundlePath}":`,
            error.status,
            error.message,
            error.stderr?.toString(),
            error.stdout?.toString(),
          );
        }
      }
    } else if (currentPlatform === 'darwin' && resolvedAppPathFromEnv && resolvedAppPathFromEnv.endsWith('.app')) {
      // This case handles when APP_PATH pointed directly to the .app bundle
      console.log(`[DEBUG] onPrepare Electron macOS: resolvedAppPathFromEnv is .app bundle: ${resolvedAppPathFromEnv}`);
      if (fs.existsSync(resolvedAppPathFromEnv)) {
        try {
          console.log(
            `[DEBUG] onPrepare Electron macOS: Removing quarantine attribute from app bundle: "${resolvedAppPathFromEnv}"`,
          );
          execSync(`xattr -r -d com.apple.quarantine "${resolvedAppPathFromEnv}"`, { stdio: 'pipe' });
          console.log(
            `[DEBUG] onPrepare Electron macOS: Quarantine removal command executed for "${resolvedAppPathFromEnv}".`,
          );
        } catch (error) {
          console.warn(
            `[WARN] onPrepare Electron macOS: Error removing quarantine for app bundle "${resolvedAppPathFromEnv}":`,
            error.status,
            error.message,
            error.stderr?.toString(),
            error.stdout?.toString(),
          );
        }
      }
    }
  };
}

// Function to clean up old user data directories
function cleanupOldUserDataDirs() {
  try {
    const e2eDir = __dirname;
    const dirEntries = fs.readdirSync(e2eDir);
    // Adjust pattern if Tauri uses a different user data dir prefix
    const userDataDirPattern = new RegExp(`^\.(electron|tauri)-user-data-${mode}-.*$`);

    let cleanedCount = 0;
    for (const entry of dirEntries) {
      if (userDataDirPattern.test(entry)) {
        const fullPath = path.join(e2eDir, entry);
        try {
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
    if (cleanedCount > 0) console.log(`[DEBUG] Cleaned up ${cleanedCount} old user data directories`);
  } catch (e) {
    console.error(`[ERROR] Failed to clean up old user data directories: ${e}`);
  }
}

cleanupOldUserDataDirs();

let specPattern;
const specificSpecFile = process.env.SPEC_FILE;
if (specificSpecFile) {
  specPattern = path.resolve(__dirname, 'test', specificSpecFile);
} else {
  const testDirPath = path.resolve(__dirname, 'test');
  specPattern = `${testDirPath}/**/*.spec.ts`;
}

const config: any = {
  // Changed Options.Testrunner to any
  services: services,
  capabilities: capabilities,
  framework: framework,
  reporters: reporters,
  maxInstances: 1,
  waitforTimeout: 60000,
  connectionRetryCount: 3,
  connectionRetryTimeout: 60000,
  logLevel: 'debug',
  runner: 'local',
  outputDir: `wdio-logs-${e2eAppType}-${mode}`,
  specs: [specPattern],
  baseUrl: `file://${__dirname}`,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
    bail: true,
  },
  onPrepare: onPrepareHook,
  beforeSession: beforeSessionHook,
  afterSession: afterSessionHook,
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

process.env.TEST = 'true';

console.log('[DEBUG] Final WebdriverIO Config:', JSON.stringify(config, null, 2));

export { config };
