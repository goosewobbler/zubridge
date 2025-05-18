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
      const permissions = stats.mode.toString(8); // Show permissions for all items
      console.log(`${' '.repeat(indent + 2)}[DEBUG] ${itemType}: ${item} ${size} [${permissions}]`);

      // If this is a macOS app bundle, explore the executable in Contents/MacOS regardless of depth
      if (stats.isDirectory() && item.endsWith('.app') && currentPlatform === 'darwin') {
        const macOSPath = path.join(itemPath, 'Contents', 'MacOS');
        if (fs.existsSync(macOSPath)) {
          console.log(`${' '.repeat(indent + 4)}[DEBUG] Contents of ${macOSPath}:`);
          try {
            const exeFiles = fs.readdirSync(macOSPath);
            for (const exe of exeFiles) {
              const exePath = path.join(macOSPath, exe);
              const exeStats = fs.statSync(exePath);
              const isExecutable = (exeStats.mode & fs.constants.S_IXUSR) !== 0;
              console.log(
                `${' '.repeat(indent + 6)}[DEBUG] File: ${exe} (${exeStats.size} bytes) [${exeStats.mode.toString(8)}] Executable: ${isExecutable}`,
              );
            }
          } catch (err) {
            console.log(`${' '.repeat(indent + 4)}[DEBUG] Error reading MacOS directory: ${err}`);
          }
        }
      } else if (stats.isDirectory()) {
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

  console.log(`[DEBUG] Searching for macOS binary in ${fullOutputPath}`);

  // Determine architecture-specific directory
  const archDirs = ['mac-arm64', 'mac-universal', 'mac'];

  for (const dir of archDirs) {
    const archPath = path.join(fullOutputPath, dir);
    if (fs.existsSync(archPath)) {
      console.log(`[DEBUG] Checking in ${archPath}`);
      const appName = `zubridge-electron-example-${mode}.app`;
      const appPath = path.join(archPath, appName);

      if (fs.existsSync(appPath)) {
        const macOSDir = path.join(appPath, 'Contents', 'MacOS');

        if (fs.existsSync(macOSDir)) {
          // Check for binary with app name
          const binaryPath = path.join(macOSDir, `zubridge-electron-example-${mode}`);
          if (fs.existsSync(binaryPath)) {
            console.log(`[DEBUG] Found macOS binary at: ${binaryPath}`);

            // Ensure it's executable
            try {
              const stats = fs.statSync(binaryPath);
              if ((stats.mode & fs.constants.S_IXUSR) === 0) {
                console.log(`[DEBUG] Binary not executable, fixing permissions`);
                fs.chmodSync(binaryPath, stats.mode | fs.constants.S_IXUSR);
              }
            } catch (err) {
              console.log(`[DEBUG] Error checking binary permissions: ${err}`);
            }

            return binaryPath;
          }

          // If specific name not found, try looking for any executable in MacOS dir
          try {
            const files = fs.readdirSync(macOSDir);
            for (const file of files) {
              const filePath = path.join(macOSDir, file);
              const stats = fs.statSync(filePath);
              if (stats.isFile()) {
                console.log(`[DEBUG] Found alternative binary: ${filePath}`);

                // Ensure it's executable
                if ((stats.mode & fs.constants.S_IXUSR) === 0) {
                  console.log(`[DEBUG] Binary not executable, fixing permissions`);
                  fs.chmodSync(filePath, stats.mode | fs.constants.S_IXUSR);
                }

                return filePath;
              }
            }
          } catch (err) {
            console.log(`[DEBUG] Error searching MacOS directory: ${err}`);
          }
        }
      }
    }
  }

  return null;
}

// Function to directly find the Linux binary
function findLinuxBinary() {
  if (currentPlatform !== 'linux') return null;

  const fullOutputPath = path.join(appPath, outputDir);
  if (!fs.existsSync(fullOutputPath)) return null;

  // Check linux-unpacked directory first
  const linuxUnpackedPath = path.join(fullOutputPath, 'linux-unpacked');
  if (fs.existsSync(linuxUnpackedPath)) {
    const binaryPath = path.join(linuxUnpackedPath, `zubridge-electron-example-${mode}`);
    if (fs.existsSync(binaryPath)) {
      console.log(`[DEBUG] Found Linux binary at: ${binaryPath}`);
      return binaryPath;
    }
  }

  // Check for AppImage format
  const appImagePattern = new RegExp(`zubridge-electron-example-${mode}-.*\\.AppImage$`);
  const dirItems = fs.readdirSync(fullOutputPath);
  for (const item of dirItems) {
    if (appImagePattern.test(item)) {
      const appImagePath = path.join(fullOutputPath, item);
      console.log(`[DEBUG] Found Linux AppImage: ${appImagePath}`);
      return appImagePath;
    }
  }

  // Check for exact AppImage name (fallback)
  const exactAppImagePath = path.join(fullOutputPath, `zubridge-electron-example-${mode}-1.0.0-next.1.AppImage`);
  if (fs.existsSync(exactAppImagePath)) {
    console.log(`[DEBUG] Found Linux AppImage at expected path: ${exactAppImagePath}`);
    return exactAppImagePath;
  }

  // Search for other possible locations
  const possibleDirs = [`linux-${currentArch}-unpacked`, 'linux-unpacked'];
  for (const dir of possibleDirs) {
    const dirPath = path.join(fullOutputPath, dir);
    if (fs.existsSync(dirPath)) {
      const binaryPath = path.join(dirPath, `zubridge-electron-example-${mode}`);
      if (fs.existsSync(binaryPath)) {
        console.log(`[DEBUG] Found Linux binary in alternative location: ${binaryPath}`);
        return binaryPath;
      }
    }
  }

  return null;
}

// Function to directly find the binary for the current platform
function findBinaryDirectly() {
  if (currentPlatform === 'darwin') {
    return findMacOSBinary();
  } else if (currentPlatform === 'linux') {
    return findLinuxBinary();
  }
  return null;
}

// Import the electron-builder configuration
async function getBuilderConfig() {
  try {
    // Set this environment variable so the config file knows we're in the e2e test environment
    process.env.ZUBRIDGE_MODE = mode;

    // Dynamically import the electron-builder config
    const configPath = path.join(appPath, 'electron-builder.config.ts');
    console.log(`[DEBUG] Loading electron-builder config from: ${configPath}`);

    // We can't directly import it with ESM because it might be using CJS or have side effects,
    // so we'll create a simpler, equivalent config object

    // Derive the configuration based on our known structure
    const config = {
      appId: `com.zubridge.example.${mode}`,
      productName: `zubridge-electron-example-${mode}`,
      directories: {
        output: `dist-${mode}`,
      },
    };

    console.log(`[DEBUG] Created builder config based on electron-builder.config.ts pattern`);
    return config;
  } catch (error) {
    console.error(`[DEBUG] Error loading electron-builder config: ${error}`);
    throw error;
  }
}

try {
  // List contents of the output directory at a limited depth
  const fullOutputPath = path.join(appPath, outputDir);
  console.log(`[DEBUG] Checking expected output directory: ${fullOutputPath}`);
  listDirectoryContents(fullOutputPath, 0, 2);

  // Get the electron-builder config
  const builderConfig = await getBuilderConfig();
  console.log(`[DEBUG] Builder config:`, JSON.stringify(builderConfig, null, 2));

  // Create AppBuildInfo for electron-builder
  const appBuildInfo = {
    appName: `zubridge-electron-example-${mode}`,
    config: builderConfig,
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

    // Try platform-specific direct detection
    const directBinaryPath = findBinaryDirectly();
    if (directBinaryPath) {
      console.log(`[DEBUG] Found binary directly: ${directBinaryPath}`);
      binaryPath = directBinaryPath;
    } else {
      throw new Error(`Failed to find binary using both getBinaryPath and direct detection`);
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

// Fix for macOS and Linux: Ensure the binary is always executable before running tests
if ((currentPlatform === 'darwin' || currentPlatform === 'linux') && binaryPath && fs.existsSync(binaryPath)) {
  try {
    const stats = fs.statSync(binaryPath);
    const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;
    if (!isExecutable) {
      console.log(`[DEBUG] Making ${currentPlatform} binary executable...`);
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
  } else {
    console.log(`[DEBUG] Using existing logs directory: ${logsDir}`);
    // List contents of logs directory if it exists
    try {
      const files = fs.readdirSync(logsDir);
      console.log(`[DEBUG] Logs directory contains ${files.length} files`);
      if (files.length > 0) {
        console.log('[DEBUG] Log files found:');
        files.forEach((file) => console.log(`[DEBUG]   - ${file}`));
      } else {
        console.log('[DEBUG] Logs directory is empty');
      }
    } catch (err) {
      console.error(`[ERROR] Failed to read logs directory ${logsDir}:`, err);
    }
  }

  // Ensure directory has correct permissions
  try {
    const stats = fs.statSync(logsDir);
    console.log(`[DEBUG] Logs directory permissions: ${stats.mode.toString(8)}`);
    // Make sure directory is writable
    fs.accessSync(logsDir, fs.constants.W_OK);
    console.log(`[DEBUG] Logs directory is writable`);
  } catch (err) {
    console.error(`[ERROR] Logs directory permission issue: ${err}`);
    // Try to fix permissions if needed
    try {
      fs.chmodSync(logsDir, 0o755);
      console.log(`[DEBUG] Fixed logs directory permissions`);
    } catch (fixErr) {
      console.error(`[ERROR] Failed to fix logs directory permissions: ${fixErr}`);
    }
  }
} catch (e) {
  console.error(`[ERROR] Failed to set up logs directory ${logsDir}:`, e);
  // Fallback to a different directory if this fails
  try {
    const fallbackDir = path.join(process.cwd(), 'logs');
    console.log(`[DEBUG] Trying fallback logs directory: ${fallbackDir}`);
    fs.mkdirSync(fallbackDir, { recursive: true });
    console.log(`[DEBUG] Created fallback logs directory: ${fallbackDir}`);
  } catch (fallbackErr) {
    console.error(`[ERROR] Failed to create fallback logs directory:`, fallbackErr);
  }
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
  outputDir: logsDir,
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
  onComplete: function (exitCode, config, capabilities, results) {
    console.log(`[DEBUG] Test run completed with exit code: ${exitCode}`);

    // Log results summary
    if (results) {
      console.log(`[DEBUG] Test results summary:`);
      console.log(`[DEBUG] Specs total: ${results.specs.length}`);
      console.log(`[DEBUG] Suites completed: ${results.finished}`);
      console.log(`[DEBUG] Suites failed: ${results.failed}`);

      // Try to log any errors from the results
      if (results.failed > 0) {
        console.log('[DEBUG] Test failures detected:');
        results.specs.forEach((spec, index) => {
          if (spec.error) {
            console.log(`[DEBUG] Spec #${index} failed: ${spec.error}`);
          }
        });
      }
    }

    // Check for log files
    try {
      const logFiles = fs.readdirSync(logsDir).filter((f) => f.endsWith('.log'));
      console.log(`[DEBUG] ${logFiles.length} log files found in ${logsDir}`);
      logFiles.forEach((file) => {
        console.log(`[DEBUG] Log file: ${file}`);
        // Log the last few lines of each file for debugging
        try {
          const logContent = fs.readFileSync(path.join(logsDir, file), 'utf-8');
          const lines = logContent.split('\n');
          const lastLines = lines.slice(Math.max(0, lines.length - 20)).join('\n');
          console.log(`[DEBUG] Last 20 lines of ${file}:\n${lastLines}`);
        } catch (err) {
          console.error(`[ERROR] Failed to read log file ${file}:`, err);
        }
      });
    } catch (err) {
      console.error(`[ERROR] Failed to check for log files:`, err);
    }
  },
  tsConfigPath: path.join(__dirname, 'tsconfig.json'),
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000, // Increase test timeout for macOS builds
  },
  afterTest: async function (test, context, { error, result, duration, passed, retries }) {
    // Log test result information
    console.log(`[DEBUG] Test completed: ${test.parent} - ${test.title}`);
    console.log(`[DEBUG] Status: ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`[DEBUG] Duration: ${duration}ms`);

    if (!passed) {
      console.error(`[ERROR] Test failed: ${test.parent} - ${test.title}`);
      if (error) {
        console.error(`[ERROR] Error message: ${error.message}`);
        console.error(`[ERROR] Error stack: ${error.stack}`);
      }

      // Try to capture a screenshot on failure
      try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const screenshotPath = path.join(logsDir, `${test.parent}-${test.title}-${timestamp}.png`);
        console.log(`[DEBUG] Capturing screenshot to: ${screenshotPath}`);

        await browser.saveScreenshot(screenshotPath);
        console.log(`[DEBUG] Screenshot saved to: ${screenshotPath}`);
      } catch (screenshotErr) {
        console.error(`[ERROR] Failed to capture screenshot: ${screenshotErr}`);
      }

      // Log browser console logs
      try {
        const logs = await browser.getLogs('browser');
        console.log(`[DEBUG] Browser console logs (${logs.length} entries):`);
        logs.forEach((log, i) => {
          // Handle log entries safely with proper type checking
          const level = typeof log === 'object' && log && 'level' in log ? log.level : 'unknown';
          const message = typeof log === 'object' && log && 'message' in log ? log.message : String(log);
          console.log(`[DEBUG] [Console ${i}] [${level}] ${message}`);
        });
      } catch (logsErr) {
        console.error(`[ERROR] Failed to get browser logs: ${logsErr}`);
      }
    }
  },
};

// Set up environment
process.env.TEST = 'true'; // General flag for test environment
globalThis.packageJson = packageJson; // Make package.json available if needed in tests

export { config };
