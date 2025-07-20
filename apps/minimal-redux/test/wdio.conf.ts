import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// App directory is current directory
const appDir = __dirname;
const appName = 'minimal-redux';

console.log(`[DEBUG] Testing app: ${appName}`);
console.log(`[DEBUG] App directory: ${appDir}`);

// Test specs location
const testSpecs = [path.join(__dirname, 'test', 'specs', '**/*.spec.ts')];

console.log(`[DEBUG] Test specs pattern: ${testSpecs}`);

// Check for electron binary - it should be in the app's root node_modules
const electronBinPath = path.join(appDir, 'node_modules', '.bin', 'electron');
console.log(`[DEBUG] Checking electron binary at: ${electronBinPath}`);
console.log(`[DEBUG] Electron binary exists: ${fs.existsSync(electronBinPath)}`);

// Check app entry point - using relative path
const appEntryPoint = './out/main/index.js';
const fullAppEntryPoint = path.join(appDir, appEntryPoint);
console.log(`[DEBUG] App entry point (relative): ${appEntryPoint}`);
console.log(`[DEBUG] App entry point (full): ${fullAppEntryPoint}`);
console.log(`[DEBUG] App entry point exists: ${fs.existsSync(fullAppEntryPoint)}`);

// Also check if electron executable exists
const electronExecPath = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron');
console.log(`[DEBUG] Checking electron executable at: ${electronExecPath}`);
console.log(`[DEBUG] Electron executable exists: ${fs.existsSync(electronExecPath)}`);

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
          // Native crash debugging flags
          '--enable-logging=stderr',
          '--log-level=0',
          '--v=1',
          '--enable-crash-reporter',
          '--crash-dumps-dir=/tmp/electron-crashes',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          // Memory debugging
          '--max_old_space_size=2048',
          '--expose-gc',
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

  // CDP debugging and validation hooks
  onPrepare: async function (config, capabilities) {
    console.log('=== CDP DEBUG: onPrepare hook ===');
    console.log('Platform:', process.platform);
    console.log('Available capabilities:', JSON.stringify(capabilities, null, 2));
  },

  before: async function (capabilities, specs) {
    console.log('=== CDP DEBUG: before hook ===');
    console.log('Session capabilities:', JSON.stringify(capabilities, null, 2));

    // Add CDP connection validation
    try {
      const sessionId = browser.sessionId;
      console.log('WebDriver session ID:', sessionId);

      // Try to get current URL to verify basic connectivity
      const url = await browser.getUrl();
      console.log('Initial URL:', url);

      // Check if we can access electron APIs
      const title = await browser.getTitle();
      console.log('Initial title:', title);
    } catch (e) {
      console.log('CDP DEBUG: Error in basic connectivity check:', e.message);
    }
  },

  beforeSession: async function (config, capabilities, specs) {
    console.log('=== CDP DEBUG: beforeSession hook ===');
    console.log('About to create session with capabilities:', JSON.stringify(capabilities, null, 2));

    // Check chromedriver options specifically
    if (capabilities['wdio:chromedriverOptions']) {
      console.log('Chromedriver options found:', JSON.stringify(capabilities['wdio:chromedriverOptions'], null, 2));
    } else {
      console.log('No explicit chromedriver options found - using auto-detection');
    }

    // Check for existing electron processes
    try {
      const { execSync } = await import('child_process');
      const processes = execSync('ps aux | grep electron || true', { encoding: 'utf8' });
      console.log('Existing electron processes:');
      console.log(processes);
    } catch (e) {
      console.log('Could not check existing processes:', e.message);
    }

    // Check if electron binary exists
    const fs = await import('fs');
    const path = await import('path');
    const electronBinPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
    console.log(`Electron binary path: ${electronBinPath}`);
    console.log(`Electron binary exists: ${fs.existsSync(electronBinPath)}`);

    if (fs.existsSync(electronBinPath)) {
      try {
        const stats = fs.statSync(electronBinPath);
        console.log(`Electron binary permissions: ${stats.mode.toString(8)}`);
      } catch (e) {
        console.log('Could not get electron binary stats:', e.message);
      }
    }
  },

  // Hooks to capture logs and debug info
  afterTest: async function (test, context, { error, result, duration, passed, retries }) {
    if (!passed && error) {
      console.log('=== TEST FAILED DEBUG INFO ===');

      try {
        // Get browser logs
        const logs = await browser.getLogs('browser');
        console.log('Browser logs:', logs);
      } catch (e) {
        console.log('Could not get browser logs:', e.message);
      }

      try {
        // Get page source/HTML
        const pageSource = await browser.getPageSource();
        console.log('Page source:', pageSource);
      } catch (e) {
        console.log('Could not get page source:', e.message);
      }

      try {
        // Get current URL
        const url = await browser.getUrl();
        console.log('Current URL:', url);
      } catch (e) {
        console.log('Could not get URL:', e.message);
      }

      try {
        // Check if basic elements exist
        const bodyExists = await browser.$('body').isExisting();
        const rootExists = await browser.$('#root').isExisting();
        const h2Exists = await browser.$('h2').isExisting();
        const loadingExists = await browser.$('div*=Loading').isExisting();

        console.log('Element existence check:', {
          body: bodyExists,
          root: rootExists,
          h2: h2Exists,
          loading: loadingExists,
        });

        // Get root element content if it exists
        if (rootExists) {
          const rootHTML = await browser.$('#root').getHTML();
          console.log('Root element HTML:', rootHTML);
        }
      } catch (e) {
        console.log('Could not check elements:', e.message);
      }
    }
  },
};

console.log('[DEBUG] WebdriverIO Config for minimal app:', JSON.stringify(config, null, 2));

export { config };
