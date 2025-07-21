import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// App directory is parent directory (since config is now in test/ subdirectory)
const appDir = path.dirname(__dirname);
const appName = 'minimal-custom';

// Test specs location
const testSpecs = [path.join(__dirname, 'specs', '**/*.spec.ts')];

// Check app entry point - using relative path
const appEntryPoint = './out/main/index.js';

const config: any = {
  runner: 'local',
  specs: testSpecs,
  exclude: [],
  maxInstances: 1,
  capabilities: [
    {
      'browserName': 'electron',
      'wdio:electronServiceOptions': {
        appEntryPoint: appEntryPoint,
      },
      'goog:loggingPrefs': {
        browser: 'ALL',
        driver: 'ALL',
      },
      'goog:chromeOptions': {
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--headless=new',
          '--user-data-dir=/tmp/wdio-electron-' + Date.now(),
        ],
      },
    },
  ],
  logLevel: 'info',
  bail: 0,
  baseUrl: '',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: ['electron'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  tsConfigPath: path.join(__dirname, 'tsconfig.json'),
};

export { config };
