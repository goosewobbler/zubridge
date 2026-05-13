import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Tell the spawned Tauri binary to register tauri-plugin-wdio-webdriver
// (the embedded WebDriver HTTP server). Matches the wdio-desktop-mobile
// example's embedded config.
process.env.WDIO_EMBEDDED_SERVER = 'true';

export const config = {
  runner: 'local',
  specs: ['./test/specs/**/*.spec.ts'],
  exclude: [],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        // Explicit binary path avoids silent auto-discovery failure modes and also works around a
        // @wdio/tauri-service@1.0.0 Windows bug where the resolved path is never written back to
        // tauriOptions.application, causing workers to spawn the directory and get ENOENT.
        application: path.join(
          __dirname,
          'src-tauri',
          'target',
          'debug',
          `e2e-tauri${process.platform === 'win32' ? '.exe' : ''}`,
        ),
      },
    },
  ],
  logLevel: process.env.DEBUG ? 'debug' : 'info',
  bail: 0,
  baseUrl: '',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [
    [
      '@wdio/tauri-service',
      {
        driverProvider: 'embedded',
        windowLabel: 'main',
        captureBackendLogs: true,
        captureFrontendLogs: true,
      },
    ],
  ],
  outputDir: './wdio-logs-tauri',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  tsConfigPath: path.join(__dirname, 'test', 'tsconfig.json'),
};
