import url from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Get the app directory (one level up from test/)
const appDir = path.resolve(__dirname, '..');
const appName = 'minimal-custom';

console.log(`[DEBUG] Testing app: ${appName}`);
console.log(`[DEBUG] App directory: ${appDir}`);

// Test specs location
const testSpecs = [path.join(__dirname, 'specs', '**/*.spec.ts')];

console.log(`[DEBUG] Test specs pattern: ${testSpecs}`);

// Create unique user data directory for this test run
const uniqueUserDataDir = path.join(os.tmpdir(), `electron-user-data-${appName}-${Date.now()}`);

const config: any = {
  services: ['electron'],
  capabilities: [
    {
      'browserName': 'electron',
      'wdio:electronServiceOptions': {
        appEntryPoint: path.join(appDir, 'out', 'main', 'index.js'),
        restoreMocks: true,
      },
    },
  ],
  framework: 'mocha',
  maxInstances: 1,
  waitforTimeout: 30000,
  connectionRetryCount: 3,
  connectionRetryTimeout: 30000,
  logLevel: 'info',
  runner: 'local',
  outputDir: `wdio-logs-${appName}`,
  specs: testSpecs,
  baseUrl: `file://${__dirname}`,
  mochaOpts: {
    ui: 'bdd',
    timeout: 300000, // 5 minutes - shorter than main E2E tests
    bail: true,
  },
};

console.log('[DEBUG] WebdriverIO Config for minimal app:', JSON.stringify(config, null, 2));

export { config };
