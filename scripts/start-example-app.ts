#!/usr/bin/env node

/**
 * Script to run the production build of an example app (Electron or Tauri) based on the current OS.
 * This handles finding the correct binary path for the built app in the dist directory.
 *
 * Usage: tsx scripts/start-example-app.ts [app-name]
 * Example: tsx scripts/start-example-app.ts e2e-electron
 *          tsx scripts/start-example-app.ts e2e-tauri
 *
 * For Electron apps, you can specify a mode:
 * Example: tsx scripts/start-example-app.ts e2e-electron basic
 *          tsx scripts/start-example-app.ts e2e-electron handlers
 *          tsx scripts/start-example-app.ts e2e-electron reducers
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Get app name and mode from command line arguments
const appName = process.argv[2];
// Mode is optional and only used for electron apps (basic, handlers, reducers)
const mode = process.argv[3] || 'basic'; // Default to basic if not specified

if (!appName) {
  console.error('Error: App name is required.');
  console.error('Usage: tsx scripts/start-example-app.ts [app-name] [mode]');
  console.error('Example: tsx scripts/start-example-app.ts electron-e2e');
  console.error('         tsx scripts/start-example-app.ts electron-e2e basic');
  console.error('         tsx scripts/start-example-app.ts tauri-e2e');
  process.exit(1);
}

const platform = os.platform();
const arch = os.arch();
const isTauriApp = appName.includes('tauri');
const isElectronApp = appName.includes('electron');

// For Electron apps, we now use a mode-specific dist directory
const distDir = path.resolve(
  process.cwd(),
  isTauriApp
    ? 'src-tauri/target/release/bundle'
    : isElectronApp
      ? `dist-${mode}` // Mode-specific directory
      : 'dist',
);

// Check if dist directory exists
if (!fs.existsSync(distDir)) {
  console.error(`Error: ${distDir} directory not found.`);
  if (isTauriApp) {
    console.error('Please run "pnpm tauri build" first.');
  } else if (isElectronApp) {
    console.error(`Please run "pnpm build:${mode}" first.`);
  } else {
    console.error('Please run "pnpm build" first.');
  }
  process.exit(1);
}

try {
  if (isTauriApp) {
    startTauriApp(appName, platform, arch, distDir);
  } else {
    // For Electron apps, we need to check if the name contains the mode
    const fullAppName =
      isElectronApp && !appName.includes(mode)
        ? `${appName}-${mode}` // Add mode suffix if not already included
        : appName;
    startElectronApp(fullAppName, platform, arch, distDir);
  }
} catch (error) {
  if (error instanceof Error) {
    console.error(`Error starting the application: ${error.message}`);
  } else {
    console.error('An unknown error occurred while starting the application');
  }
  console.error(
    `Please make sure you have built the app using "${isTauriApp ? 'pnpm tauri build' : isElectronApp ? `pnpm build:${mode}` : 'pnpm build'}"`,
  );
  process.exit(1);
}

function startElectronApp(appName: string, platform: string, arch: string, distDir: string): void {
  let appPath: string;

  if (platform === 'darwin') {
    // macOS: .app package inside dist/mac or dist/mac-arm64 directory
    const archSuffix = arch === 'arm64' ? '-arm64' : '';
    appPath = path.join(distDir, `mac${archSuffix}`, `${appName}.app`);

    // Fallback to regular mac directory if the architecture-specific one doesn't exist
    if (!fs.existsSync(appPath) && arch === 'arm64') {
      appPath = path.join(distDir, 'mac', `${appName}.app`);
    }

    if (fs.existsSync(appPath)) {
      console.log(`Starting ${appName} on macOS (${arch})...`);
      execSync(`open "${appPath}"`, { stdio: 'inherit' });
    } else {
      throw new Error(`macOS app not found at ${appPath}`);
    }
  } else if (platform === 'win32') {
    // Windows: .exe file inside dist/win-unpacked directory
    appPath = path.join(distDir, 'win-unpacked', `${appName}.exe`);

    // Fallback to regular dist/ directory if win-unpacked doesn't exist
    if (!fs.existsSync(appPath)) {
      appPath = path.join(distDir, `${appName}.exe`);
    }

    if (fs.existsSync(appPath)) {
      console.log(`Starting ${appName} on Windows...`);
      execSync(`"${appPath}"`, { stdio: 'inherit' });
    } else {
      throw new Error(`Windows executable not found at ${appPath}`);
    }
  } else if (platform === 'linux') {
    // Linux: AppImage file inside dist/ directory
    const files = fs.readdirSync(distDir);
    const appImage = files.find((file) => file.endsWith('.AppImage'));

    if (appImage) {
      appPath = path.join(distDir, appImage);
      console.log(`Starting ${appName} on Linux...`);
      execSync(`"${appPath}"`, { stdio: 'inherit' });
    } else {
      throw new Error('Linux AppImage not found in dist directory');
    }
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

function startTauriApp(appName: string, platform: string, arch: string, distDir: string): void {
  let appPath: string;

  if (platform === 'darwin') {
    // macOS: .app package inside macos directory
    const appDir = path.join(distDir, 'macos');

    // Try with the actual app name
    const possiblePaths = [path.join(appDir, `${appName}.app`)];

    appPath = possiblePaths.find((p) => fs.existsSync(p)) || '';

    if (appPath) {
      console.log(`Starting ${appName} on macOS (${arch})...`);
      execSync(`open "${appPath}"`, { stdio: 'inherit' });
    } else {
      throw new Error(`macOS app not found in ${appDir}`);
    }
  } else if (platform === 'win32') {
    // Windows: .msi file inside windows directory
    const appDir = path.join(distDir, 'windows');

    if (fs.existsSync(appDir)) {
      const files = fs.readdirSync(appDir);
      const installer = files.find((file) => file.endsWith('.msi'));

      if (installer) {
        appPath = path.join(appDir, installer);
        console.log(`Starting ${appName} installer on Windows...`);
        execSync(`start "" "${appPath}"`, { stdio: 'inherit' });
      } else {
        throw new Error(`Windows installer not found in ${appDir}`);
      }
    } else {
      throw new Error(`Windows build directory not found at ${appDir}`);
    }
  } else if (platform === 'linux') {
    // Linux: appImage file inside linux directory, or deb/rpm files
    const appDir = path.join(distDir, 'linux');

    if (fs.existsSync(appDir)) {
      const files = fs.readdirSync(appDir);
      const appImage = files.find((file) => file.endsWith('.AppImage'));

      if (appImage) {
        appPath = path.join(appDir, appImage);
        console.log(`Starting ${appName} on Linux...`);
        execSync(`"${appPath}"`, { stdio: 'inherit' });
      } else {
        const deb = files.find((file) => file.endsWith('.deb'));
        if (deb) {
          appPath = path.join(appDir, deb);
          console.log(`Installing ${appName} on Linux (deb)...`);
          execSync(`sudo dpkg -i "${appPath}"`, { stdio: 'inherit' });
        } else {
          const rpm = files.find((file) => file.endsWith('.rpm'));
          if (rpm) {
            appPath = path.join(appDir, rpm);
            console.log(`Installing ${appName} on Linux (rpm)...`);
            execSync(`sudo rpm -i "${appPath}"`, { stdio: 'inherit' });
          } else {
            throw new Error(`Linux package not found in ${appDir}`);
          }
        }
      }
    } else {
      throw new Error(`Linux build directory not found at ${appDir}`);
    }
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}
