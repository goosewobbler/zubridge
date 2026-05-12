import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export const config = {
  runner: 'local',
  specs: ['./test/specs/**/*.spec.ts'],
  exclude: [],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        // Directory containing src-tauri/; service resolves to target/debug/<productName>
        application: __dirname,
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
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  tsConfigPath: path.join(__dirname, 'test', 'tsconfig.json'),
};
