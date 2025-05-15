import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import type { NormalizedPackageJson } from 'read-package-up';

import { getElectronVersion } from '@wdio/electron-utils';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const appDir = process.env.APP_DIR as string;
const mode = process.env.MODE || 'basic'; // Default to basic mode if not specified
const appPath = path.join(__dirname, '..', 'apps', appDir);
const packageJsonPath = path.join(appPath, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' })) as NormalizedPackageJson;
const pkg = { packageJson, path: packageJsonPath };
const electronVersion = await getElectronVersion(pkg);

console.log(`[DEBUG] packageJsonPath: ${packageJsonPath}`);
console.log(`[DEBUG] appPath: ${appPath}`);

// Find the actual binary path directly
let binaryPath = '';

// First check if we have a built app
const macAppPath = path.join(
  appPath,
  `dist-${mode}`,
  'mac-arm64',
  `zubridge-electron-example-${mode}.app`,
  'Contents',
  'MacOS',
  `zubridge-electron-example-${mode}`,
);
const winAppPath = path.join(appPath, `dist-${mode}`, 'win-unpacked', `zubridge-electron-example-${mode}.exe`);
const linuxAppPath = path.join(appPath, `dist-${mode}`, 'linux-unpacked', `zubridge-electron-example-${mode}`);

console.log(`[DEBUG] Checking for built app at mac: ${macAppPath}`);
console.log(`[DEBUG] Checking for built app at win: ${winAppPath}`);
console.log(`[DEBUG] Checking for built app at linux: ${linuxAppPath}`);

if (fs.existsSync(macAppPath)) {
  binaryPath = macAppPath;
  console.log(`[DEBUG] Found Mac app binary: ${binaryPath}`);
} else if (fs.existsSync(winAppPath)) {
  binaryPath = winAppPath;
  console.log(`[DEBUG] Found Windows app binary: ${binaryPath}`);
} else if (fs.existsSync(linuxAppPath)) {
  binaryPath = linuxAppPath;
  console.log(`[DEBUG] Found Linux app binary: ${binaryPath}`);
} else {
  // Fallback to using electron directly with our build output
  const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  const appMain = path.join(appPath, `out-${mode}`, 'main', 'index.js');

  if (fs.existsSync(electronBin) && fs.existsSync(appMain)) {
    binaryPath = electronBin;
    process.env.ELECTRON_APP_PATH = appMain;
    console.log(`[DEBUG] No built app found, using electron binary: ${electronBin} with main: ${appMain}`);
  } else {
    console.warn(`[DEBUG] Could not find electron binary or app main file`);
  }
}

const baseArgs = ['--no-sandbox', '--disable-gpu'];
const appArgs = process.env.ELECTRON_APP_PATH ? [process.env.ELECTRON_APP_PATH, ...baseArgs] : baseArgs;

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
  outputDir: `wdio-logs-electron-${mode}`,
  specs: ['./test/*.spec.ts'],
  tsConfigPath: path.join(__dirname, 'tsconfig.json'),
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 30000,
  },
};

// Set up environment
process.env.TEST = 'true';
globalThis.packageJson = packageJson;

export { config };
