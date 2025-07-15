import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// App directory is current directory
const appDir = __dirname;
const appName = 'minimal-custom';

console.log(`[DEBUG] Testing app: ${appName}`);
console.log(`[DEBUG] App directory: ${appDir}`);

// Test specs location
const testSpecs = [path.join(__dirname, 'test', 'specs', '**/*.spec.ts')];

console.log(`[DEBUG] Test specs pattern: ${testSpecs}`);

// Check for electron binary - it should be in the app's root node_modules
const electronBinPath = path.join(appDir, 'node_modules', '.bin', 'electron');
console.log(`[DEBUG] Checking electron binary at: ${electronBinPath}`);
console.log(`[DEBUG] Electron binary exists: ${fs.existsSync(electronBinPath)}`);

// Check app entry point
const appEntryPoint = path.join(appDir, 'out', 'main', 'index.js');
console.log(`[DEBUG] App entry point: ${appEntryPoint}`);
console.log(`[DEBUG] App entry point exists: ${fs.existsSync(appEntryPoint)}`);

// Also check if electron executable exists
const electronExecPath = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron');
console.log(`[DEBUG] Checking electron executable at: ${electronExecPath}`);
console.log(`[DEBUG] Electron executable exists: ${fs.existsSync(electronExecPath)}`);

const config: any = {
  services: ['electron'],
  capabilities: [
    {
      'browserName': 'electron',
      'wdio:electronServiceOptions': {
        appEntryPoint: appEntryPoint,
        restoreMocks: true,
      },
    },
  ],
  framework: 'mocha',
  maxInstances: 1,
  waitforTimeout: 30000,
  connectionRetryCount: 3,
  connectionRetryTimeout: 120000,
  logLevel: 'info',
  runner: 'local',
  outputDir: `wdio-logs-${appName}`,
  specs: testSpecs,
  baseUrl: `file://${path.join(__dirname, 'test')}`,
  mochaOpts: {
    ui: 'bdd',
    timeout: 300000, // 5 minutes - shorter than main E2E tests
    bail: true,
  },
};

console.log('[DEBUG] WebdriverIO Config for minimal app:', JSON.stringify(config, null, 2));

export { config };
