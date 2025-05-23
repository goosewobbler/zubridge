import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';

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

let binaryPath: string | undefined = appPathFromEnv; // Use APP_PATH directly if available
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

if (e2eAppType.startsWith('tauri')) {
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    console.error(`[ERROR] Tauri app type specified, but APP_PATH is not valid: ${binaryPath}`);
    process.exit(1);
  }
  console.log(`[DEBUG] Using Tauri binary from APP_PATH: ${binaryPath}`);
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

  // Find binary path for current platform (Electron specific logic)
  // This part is only relevant if appPathFromEnv (binaryPath) was NOT provided or not valid for Electron dev
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    console.log('[DEBUG] Electron: APP_PATH not valid or not provided, attempting to find local dev binary.');
    const findMacBinary = () => {
      const macDirs = currentArch === 'arm64' ? ['mac-arm64', 'mac'] : ['mac', 'mac-arm64'];
      for (const dir of macDirs) {
        const binPath = path.join(
          electronExampleAppPath,
          `dist-${mode}`,
          dir,
          `zubridge-electron-example-${mode}.app`,
          'Contents',
          'MacOS',
          `zubridge-electron-example-${mode}`,
        );
        if (fs.existsSync(binPath)) return binPath;
      }
      const distDir = path.join(electronExampleAppPath, `dist-${mode}`);
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
            if (fs.existsSync(binPath)) return binPath;
          }
        } catch (err) {
          /* ignore */
        }
      }
      return '';
    };

    const binaryFinders = {
      darwin: findMacBinary,
      win32: () => {
        const binPath = path.join(
          electronExampleAppPath,
          `dist-${mode}`,
          'win-unpacked',
          `zubridge-electron-example-${mode}.exe`,
        );
        return fs.existsSync(binPath) ? binPath : '';
      },
      linux: () => {
        const binPath = path.join(
          electronExampleAppPath,
          `dist-${mode}`,
          'linux-unpacked',
          `zubridge-electron-example-${mode}`,
        );
        return fs.existsSync(binPath) ? binPath : '';
      },
    };

    if (binaryFinders[currentPlatform]) {
      binaryPath = binaryFinders[currentPlatform]();
    }

    if (!binaryPath) {
      console.log('[DEBUG] Electron: Attempting fallback to direct Electron execution for dev');
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
  }

  if (!binaryPath) {
    console.error('[ERROR] Electron: binaryPath is still not set after all checks.');
    process.exit(1);
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

  console.log(`[DEBUG] Electron: DEBUG environment variable: ${process.env.DEBUG}`);

  const appArgs = process.env.ELECTRON_APP_PATH ? [process.env.ELECTRON_APP_PATH, ...stabilityFlags] : stabilityFlags;

  const electronServiceOptions: any = {
    appBinaryPath: binaryPath, // Can be the app itself or the electron executable
    appArgs,
    chromeDriverArgs: ['--verbose'],
    appEnv: {
      ZUBRIDGE_MODE: mode,
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_ENABLE_STACK_DUMPING: '1',
      NODE_ENV: 'test',
      DEBUG: process.env.DEBUG || '', // Pass through DEBUG environment variable
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
    // For Electron, if APP_PATH points to a .app bundle, remove quarantine.
    // If binaryPath is the direct executable inside .app, this might not be needed here but doesn't hurt.
    if (currentPlatform === 'darwin' && binaryPath && binaryPath.endsWith('.app') && fs.existsSync(binaryPath)) {
      try {
        console.log('[DEBUG] Removing quarantine attribute from macOS Electron app bundle');
        execSync(`xattr -r -d com.apple.quarantine "${binaryPath}"`, { stdio: 'pipe' });
      } catch (error) {
        console.warn('[WARN] Error removing quarantine for Electron app bundle:', error);
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

let specPattern: string;
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
  afterTest: function (test, _context, { error }) {
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
