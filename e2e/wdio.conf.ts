import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// Default empty config for TypeScript
export const config = {};

// Add ultra-early logging to detect initialization issues
console.log('========== EARLY INITIALIZATION STARTED ==========');
console.log(`WebdriverIO config loading at ${new Date().toISOString()}`);
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${process.platform}, Architecture: ${process.arch}`);
console.log(`Working directory: ${process.cwd()}`);
console.log(`Environment variables: APP_DIR=${process.env.APP_DIR}, MODE=${process.env.MODE}`);

try {
  // Create a direct file log for ultra-early diagnostics
  const earlyLogPath = path.join(process.cwd(), 'early-wdio-init.log');
  fs.writeFileSync(earlyLogPath, `WebdriverIO early init at ${new Date().toISOString()}\n`, { flag: 'a' });
  fs.writeFileSync(
    earlyLogPath,
    `Node.js: ${process.version}, Platform: ${process.platform}, Arch: ${process.arch}\n`,
    { flag: 'a' },
  );
  fs.writeFileSync(earlyLogPath, `Working directory: ${process.cwd()}\n`, { flag: 'a' });
  fs.writeFileSync(earlyLogPath, `ENV: APP_DIR=${process.env.APP_DIR}, MODE=${process.env.MODE}\n`, { flag: 'a' });
  console.log(`Early log created at: ${earlyLogPath}`);
} catch (earlyLogErr) {
  console.error(`Failed to create early log: ${earlyLogErr}`);
}

import type { NormalizedPackageJson } from 'read-package-up';

import { getElectronVersion, getBinaryPath } from '@wdio/electron-utils';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const appDir = process.env.APP_DIR as string; // This should be 'electron-example'
const mode = process.env.MODE || 'basic'; // Default to basic mode if not specified
const appPath = path.join(__dirname, '..', 'apps', appDir); // Path to 'apps/electron-example'
const packageJsonPath = path.join(appPath, 'package.json');

// Safety check to make sure files exist
if (!fs.existsSync(packageJsonPath)) {
  console.error(`ERROR: Package.json not found at ${packageJsonPath}`);
  process.exit(1);
}

// Immediately executing async function to configure WebdriverIO
(async () => {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' })) as NormalizedPackageJson;
    const pkg = { packageJson, path: packageJsonPath };

    console.log('Reading Electron version...');
    const electronVersion = await getElectronVersion(pkg);
    console.log(`Electron version detected: ${electronVersion}`);

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

    // Standardize on a single format: wdio-logs-${mode}
    // where mode combines the app type and mode: electron-basic, redux-basic, etc.
    const standardMode = `${appDir.replace('-example', '')}-${mode}`;
    const logsDir = path.join(__dirname, `wdio-logs-${standardMode}`);

    // Create logs directory
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log(`[DEBUG] Created logs directory: ${logsDir}`);
    }

    // Explicitly define the output directory based on mode
    const outputDir = `dist-${mode}`;
    console.log(`[DEBUG] Expected output directory: ${outputDir}`);

    // Get a simplified builder config
    const builderConfig = {
      appId: `com.zubridge.example.${mode}`,
      productName: `zubridge-electron-example-${mode}`,
      directories: {
        output: outputDir,
      },
    };

    // Create AppBuildInfo for electron-builder
    const appBuildInfo = {
      appName: `zubridge-electron-example-${mode}`,
      config: builderConfig,
      isBuilder: true as const,
      isForge: false as const,
    };

    // Log the appBuildInfo being passed to getBinaryPath
    console.log(`[DEBUG] AppBuildInfo for getBinaryPath:`, JSON.stringify(appBuildInfo, null, 2));

    // Try to get binary path using the config
    let binaryPath = '';
    try {
      console.log(`[DEBUG] Attempting to get binary path...`);
      binaryPath = await getBinaryPath(packageJsonPath, appBuildInfo, electronVersion);
      console.log(`[DEBUG] Binary path found: ${binaryPath}`);

      // Verify binary exists
      if (!fs.existsSync(binaryPath)) {
        throw new Error(`Binary does not exist at path: ${binaryPath}`);
      }
    } catch (err) {
      console.error(`[ERROR] Failed to get binary path: ${err}`);
      throw err;
    }

    // Generate a unique user data directory
    const userDataDir = path.join(__dirname, `.electron-user-data-${mode}-${Date.now()}`);
    fs.mkdirSync(userDataDir, { recursive: true });
    console.log(`[DEBUG] Using user data directory: ${userDataDir}`);

    // Base args for all platforms
    const baseArgs = ['--no-sandbox'];

    // Add platform-specific args - more comprehensive for macOS
    if (currentPlatform === 'darwin') {
      // These flags help with macOS stability
      baseArgs.push('--headless=new'); // New headless mode
      baseArgs.push('--disable-gpu');
      baseArgs.push('--disable-dev-shm-usage');
      baseArgs.push('--disable-software-rasterizer');
      baseArgs.push('--disable-gpu-compositing');
      baseArgs.push('--no-proxy-server');
      baseArgs.push('--disable-hang-monitor');
      baseArgs.push('--disable-crash-reporter');
    } else if (currentPlatform === 'linux') {
      baseArgs.push('--headless=new');
      baseArgs.push('--disable-gpu');
      baseArgs.push('--disable-dev-shm-usage');
    } else if (currentPlatform === 'win32') {
      baseArgs.push('--headless=new');
    }

    // Add user data directory to args
    baseArgs.push(`--user-data-dir=${userDataDir}`);

    // Update the exported config
    Object.assign(config, {
      services: ['electron'],
      capabilities: [
        {
          'browserName': 'electron',
          'wdio:electronServiceOptions': {
            appBinaryPath: binaryPath,
            appArgs: baseArgs,
            chromeDriverArgs: ['--verbose'],
            appEnv: { ZUBRIDGE_MODE: mode },
            browserVersion: electronVersion,
          },
        },
      ],
      logLevel: 'trace', // More detailed logging
      outputDir: logsDir,
      runner: 'local',
      specs: [path.resolve(__dirname, 'test', 'basic-sync.spec.ts')], // Just try one test file
      maxInstances: 1,
      waitforTimeout: 60000, // Long timeout
      connectionRetryCount: 1, // Less retries for cleaner failures
      framework: 'mocha',
      reporters: ['spec'],
      mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
      },
      onPrepare: function () {
        console.log(`[DEBUG] WebdriverIO preparation starting`);
      },
      before: async function () {
        console.log(`[DEBUG] Test starting - waiting 5 seconds...`);
        await browser.pause(5000);
        console.log(`[DEBUG] Wait complete`);
      },
    });

    console.log('========== CONFIGURATION COMPLETE ==========');
  } catch (initError) {
    console.error(`FATAL ERROR during WebdriverIO configuration: ${initError}`);
    console.error(initError?.stack || 'No stack trace available');
    process.exit(1);
  }
})();
