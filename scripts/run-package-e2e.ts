#!/usr/bin/env node

/**
 * Script to run package E2E tests for minimal apps.
 * This script:
 * 1. Finds all minimal apps in the apps directory
 * 2. Creates a temporary directory for testing
 * 3. Packages up the electron and ui packages using turborepo
 * 4. Copies and modifies each minimal app to use the packaged versions
 * 5. Runs tests in each app
 *
 * Usage: tsx scripts/run-package-e2e.ts [app-name] [--clean-logs]
 *
 * Arguments:
 *   app-name        Optional. Name of specific app to test (e.g., zustand-basic, custom, redux, zustand-handlers, zustand-reducers)
 *                   If not specified, runs all minimal apps
 *
 * Options:
 *   --clean-logs    Clean existing log directories before running tests
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Parse command line arguments
const args = process.argv.slice(2);
const shouldCleanLogs = args.includes('--clean-logs');
const specificApp = args.find((arg) => !arg.startsWith('--'));

// Map short names to full app names
const APP_NAME_MAP = {
  'zustand-basic': 'minimal-zustand-basic',
  'custom': 'minimal-custom',
  'redux': 'minimal-redux',
  'zustand-handlers': 'minimal-zustand-handlers',
  'zustand-reducers': 'minimal-zustand-reducers',
};

// Get the full app name
const targetApp = specificApp ? APP_NAME_MAP[specificApp] || `minimal-${specificApp}` : null;

if (specificApp && !targetApp) {
  console.error(`Unknown app: ${specificApp}`);
  console.error('Available apps:', Object.keys(APP_NAME_MAP).join(', '));
  process.exit(1);
}

// Constants
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const TEMP_DIR = path.join(os.tmpdir(), 'zubridge-e2e-' + Date.now());
const ZUBRIDGE_PACKAGES = {
  dependencies: ['@zubridge/electron'],
  devDependencies: ['@zubridge/types'],
};

// Utility function to run a command and return its output
function runCommand(command: string, options: { cwd?: string; stdio?: 'inherit' | 'pipe' } = {}): string | void {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      ...options,
    });
    // When stdio is 'inherit', result will be null
    return options.stdio === 'inherit' ? undefined : result.toString().trim();
  } catch (error) {
    console.error(`Error running command: ${command}`);
    throw error;
  }
}

// Find all minimal apps in the apps directory
function findMinimalApps(): string[] {
  const appsDir = path.join(process.cwd(), 'apps');
  const allApps = fs
    .readdirSync(appsDir)
    .filter((dir) => dir.includes('minimal') && !dir.startsWith('.'))
    .map((dir) => path.join(appsDir, dir));

  // Filter to specific app if requested
  if (targetApp) {
    const filtered = allApps.filter((app) => path.basename(app) === targetApp);
    if (filtered.length === 0) {
      throw new Error(`App ${targetApp} not found in apps directory`);
    }
    return filtered;
  }

  return allApps;
}

// Build packages using turborepo
function buildPackages(): void {
  console.log('\nBuilding packages...');
  const allPackages = [...ZUBRIDGE_PACKAGES.dependencies, ...ZUBRIDGE_PACKAGES.devDependencies];
  const filterArgs = allPackages.map((pkg) => `--filter=${pkg}`).join(' ');
  runCommand(`pnpm turbo run package ${filterArgs}`, { stdio: 'inherit' });

  // Verify the packages were built by checking for their tarballs
  for (const pkg of allPackages) {
    const pkgName = pkg.replace('@zubridge/', '');
    const pkgDir = path.join(process.cwd(), 'packages', pkgName);
    const tarballs = fs.readdirSync(pkgDir).filter((f) => f.endsWith('.tgz'));
    if (tarballs.length === 0) {
      throw new Error(`No tarball found for ${pkg} after build`);
    }
  }
}

// Copy an app to the temp directory and modify its package.json
function prepareApp(appPath: string): string {
  const appName = path.basename(appPath);
  const tempAppPath = path.join(TEMP_DIR, appName);

  console.log(`\nPreparing ${appName}...`);

  // Clean logs if requested
  if (shouldCleanLogs) {
    console.log(`Cleaning logs for ${appName}...`);
    try {
      runCommand('pnpm run clean:logs', { cwd: appPath, stdio: 'inherit' });
    } catch (error) {
      console.warn(`Warning: Could not clean logs for ${appName}:`, error);
    }
  }

  // Run clean
  runCommand('pnpm clean', { cwd: appPath, stdio: 'inherit' });

  // Copy app to temp directory
  fs.cpSync(appPath, tempAppPath, { recursive: true });

  // Create .pnpmrc to prevent hoisting and ensure proper resolution
  const pnpmrcPath = path.join(tempAppPath, '.pnpmrc');
  fs.writeFileSync(pnpmrcPath, 'hoist=false\nnode-linker=isolated\n');
  console.log('[DEBUG] Created .pnpmrc with isolation settings');

  // Read package.json
  const packageJsonPath = path.join(tempAppPath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  console.log('\nOriginal package.json:', {
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
  });

  // Remove workspace dependencies before installing (they don't exist in isolated environment)
  const allZubridgePackages = [...ZUBRIDGE_PACKAGES.dependencies, ...ZUBRIDGE_PACKAGES.devDependencies];
  for (const pkg of allZubridgePackages) {
    if (packageJson.dependencies?.[pkg]) {
      console.log(`[DEBUG] Removing workspace dependency: ${pkg} from dependencies`);
      delete packageJson.dependencies[pkg];
    }
    if (packageJson.devDependencies?.[pkg]) {
      console.log(`[DEBUG] Removing workspace dependency: ${pkg} from devDependencies`);
      delete packageJson.devDependencies[pkg];
    }
  }

  // Write cleaned package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  console.log('\nCleaned package.json for initial install:', {
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
  });

  // Step 1: Install original dependencies first (ensures electron postinstall runs)
  console.log(`[DEBUG] Installing original dependencies first...`);
  runCommand('pnpm install', { cwd: tempAppPath, stdio: 'inherit' });

  // Step 2: Add local packages separately
  console.log(`[DEBUG] Adding local Zubridge packages...`);
  for (const pkg of ZUBRIDGE_PACKAGES.dependencies) {
    const pkgName = pkg.replace('@zubridge/', '');
    const pkgDir = path.join(process.cwd(), 'packages', pkgName);
    const tarballs = fs.readdirSync(pkgDir).filter((f) => f.endsWith('.tgz'));

    if (tarballs.length === 0) {
      throw new Error(`No tarball found for ${pkg}`);
    }

    const tarballPath = path.join(pkgDir, tarballs[0]);
    console.log(`[DEBUG] Adding ${pkg} from ${tarballPath}`);
    runCommand(`pnpm add ${tarballPath}`, { cwd: tempAppPath, stdio: 'inherit' });
  }

  for (const pkg of ZUBRIDGE_PACKAGES.devDependencies) {
    const pkgName = pkg.replace('@zubridge/', '');
    const pkgDir = path.join(process.cwd(), 'packages', pkgName);
    const tarballs = fs.readdirSync(pkgDir).filter((f) => f.endsWith('.tgz'));

    if (tarballs.length === 0) {
      throw new Error(`No tarball found for ${pkg}`);
    }

    const tarballPath = path.join(pkgDir, tarballs[0]);
    console.log(`[DEBUG] Adding ${pkg} from ${tarballPath} as dev dependency`);
    runCommand(`pnpm add ${tarballPath} --save-dev`, { cwd: tempAppPath, stdio: 'inherit' });
  }

  // Enhanced Electron debug logging
  const electronBinPath = path.join(tempAppPath, 'node_modules', '.bin', 'electron');
  const electronDistPath = path.join(tempAppPath, 'node_modules', 'electron', 'dist');
  const electronPackageJson = path.join(tempAppPath, 'node_modules', 'electron', 'package.json');

  // Platform-specific executable paths
  const electronExecPath =
    process.platform === 'darwin'
      ? path.join(electronDistPath, 'Electron.app', 'Contents', 'MacOS', 'Electron')
      : path.join(electronDistPath, 'electron');

  console.log(`[DEBUG] Checking electron binary at: ${electronBinPath}`);
  console.log(`[DEBUG] Electron binary exists: ${fs.existsSync(electronBinPath)}`);
  console.log(`[DEBUG] Checking electron executable at: ${electronExecPath}`);
  console.log(`[DEBUG] Electron executable exists: ${fs.existsSync(electronExecPath)}`);

  // Debug electron installation details
  console.log(`[DEBUG] Electron dist directory exists: ${fs.existsSync(electronDistPath)}`);
  if (fs.existsSync(electronDistPath)) {
    const distContents = fs.readdirSync(electronDistPath);
    console.log(`[DEBUG] Electron dist contents: ${distContents.join(', ')}`);
  }

  // Check if postinstall actually ran
  if (fs.existsSync(electronPackageJson)) {
    const electronPkg = JSON.parse(fs.readFileSync(electronPackageJson, 'utf8'));
    console.log(`[DEBUG] Electron package version: ${electronPkg.version}`);
    console.log(`[DEBUG] Electron has postinstall: ${!!electronPkg.scripts?.postinstall}`);
  } else {
    console.log(`[DEBUG] Electron package.json not found at: ${electronPackageJson}`);
  }

  // If electron binary doesn't exist, try multiple approaches
  if (!fs.existsSync(electronBinPath)) {
    console.log(`[DEBUG] Electron binary missing, trying multiple approaches...`);

    // Approach 1: Force rebuild with explicit configuration
    try {
      console.log(`[DEBUG] Approach 1: Rebuilding electron with explicit config...`);
      runCommand('pnpm config set onlyBuiltDependencies "electron,esbuild"', { cwd: tempAppPath, stdio: 'inherit' });
      runCommand('pnpm rebuild electron', { cwd: tempAppPath, stdio: 'inherit' });
      console.log(`[DEBUG] Electron rebuild completed`);
    } catch (error) {
      console.warn(`[DEBUG] Electron rebuild failed:`, error);

      // Approach 2: Remove and reinstall electron
      try {
        console.log(`[DEBUG] Approach 2: Removing and reinstalling electron...`);
        runCommand('pnpm remove electron', { cwd: tempAppPath, stdio: 'inherit' });
        runCommand('pnpm add electron@35.0.0 --save-dev', { cwd: tempAppPath, stdio: 'inherit' });
        console.log(`[DEBUG] Electron reinstall completed`);
      } catch (reinstallError) {
        console.warn(`[DEBUG] Electron reinstall failed:`, reinstallError);

        // Approach 3: Try with npm instead of pnpm
        try {
          console.log(`[DEBUG] Approach 3: Installing electron with npm...`);
          runCommand('npm install electron@35.0.0 --save-dev', { cwd: tempAppPath, stdio: 'inherit' });
          console.log(`[DEBUG] Electron npm install completed`);
        } catch (npmError) {
          console.warn(`[DEBUG] Electron npm install failed:`, npmError);
        }
      }
    }
  }

  // Final comprehensive check
  console.log(`[DEBUG] Final electron binary check: ${fs.existsSync(electronBinPath)}`);
  console.log(`[DEBUG] Final electron executable check: ${fs.existsSync(electronExecPath)}`);

  if (process.platform === 'darwin') {
    console.log(`[DEBUG] Platform is macOS - executable should be in Electron.app bundle`);
  }

  // List contents of node_modules/.bin to see what's actually there
  const binDir = path.join(tempAppPath, 'node_modules', '.bin');
  if (fs.existsSync(binDir)) {
    const binContents = fs.readdirSync(binDir);
    console.log(`[DEBUG] Contents of node_modules/.bin: ${binContents.join(', ')}`);
  }

  return tempAppPath;
}

// Copy log files from temp directory back to repo directory
function copyLogFiles(): void {
  console.log('\nCopying log files back to repo directory...');

  const minimalApps = findMinimalApps();

  for (const appPath of minimalApps) {
    const appName = path.basename(appPath);
    const tempAppPath = path.join(TEMP_DIR, appName);
    const tempLogsDir = path.join(tempAppPath, 'wdio-logs-' + appName);
    const repoLogsDir = path.join(appPath, `wdio-logs-${appName}-${TIMESTAMP}`);

    // Check if logs exist in temp directory
    if (fs.existsSync(tempLogsDir)) {
      try {
        // Copy logs from temp to repo with timestamp
        fs.cpSync(tempLogsDir, repoLogsDir, { recursive: true });
        console.log(`Copied logs for ${appName} to ${repoLogsDir}`);
      } catch (error) {
        console.warn(`Failed to copy logs for ${appName}:`, error);
      }
    }
  }
}

// Run tests in an app
function runTests(appPath: string): boolean {
  const appName = path.basename(appPath);
  console.log(`\nRunning tests in ${appName}...`);

  try {
    // Build the app first
    console.log(`Building ${appName}...`);
    runCommand('pnpm build', { cwd: appPath, stdio: 'inherit' });
    console.log(`✅ Build completed for ${appName}`);

    // Now run the tests
    console.log(`Running tests for ${appName}...`);
    runCommand('pnpm test', { cwd: appPath, stdio: 'inherit' });
    console.log(`✅ Tests passed for ${appName}`);
    return true;
  } catch (error) {
    console.error(`❌ Tests failed for ${appName}`);

    // Log wdio logs if they exist
    const logsDir = path.join(appPath, 'wdio-logs-' + appName);
    if (fs.existsSync(logsDir)) {
      console.log('\nWebdriverIO Logs:');
      const logFiles = fs.readdirSync(logsDir);
      for (const logFile of logFiles) {
        console.log(`\n=== ${logFile} ===`);
        const logContent = fs.readFileSync(path.join(logsDir, logFile), 'utf8');
        console.log(logContent);
      }
    }

    return false;
  }
}

// Main function
async function main() {
  let tempDirCreated = false;
  let hasError = false;
  const failedApps: string[] = [];
  const passedApps: string[] = [];

  try {
    // Create temp directory
    console.log(`Creating temporary directory: ${TEMP_DIR}`);
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    tempDirCreated = true;

    // Build packages
    buildPackages();

    // Find minimal apps
    const minimalApps = findMinimalApps();
    if (minimalApps.length === 0) {
      throw new Error('No minimal apps found in apps directory');
    }
    console.log(`\nFound ${minimalApps.length} minimal apps: ${minimalApps.map((p) => path.basename(p)).join(', ')}`);

    // Process each app
    for (const appPath of minimalApps) {
      const appName = path.basename(appPath);
      const tempAppPath = prepareApp(appPath);

      const testPassed = runTests(tempAppPath);
      if (testPassed) {
        passedApps.push(appName);
      } else {
        failedApps.push(appName);
        hasError = true;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total apps: ${minimalApps.length}`);
    console.log(`Passed: ${passedApps.length} (${passedApps.join(', ')})`);
    console.log(`Failed: ${failedApps.length} ${failedApps.length > 0 ? `(${failedApps.join(', ')})` : ''}`);

    if (failedApps.length === 0) {
      console.log('\n✅ All tests completed successfully!');
    } else {
      console.log('\n❌ Some tests failed. Check logs above for details.');
    }
  } catch (error) {
    console.error('\nError running package E2E tests:', error);
    hasError = true;
  } finally {
    // Only attempt cleanup operations if temp directory was created
    if (tempDirCreated) {
      // Copy log files back to repo directory before cleanup
      try {
        copyLogFiles();
      } catch (error) {
        console.warn('Failed to copy log files:', error);
      }

      // Clean up temp directory
      try {
        console.log('\nCleaning up...');
        if (fs.existsSync(TEMP_DIR)) {
          fs.rmSync(TEMP_DIR, { recursive: true, force: true });
          console.log('Temp directory cleaned up successfully');
        }
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error);
      }
    }
  }

  // Exit with error code if there was an error
  if (hasError) {
    process.exit(1);
  }
}

// Run the script
main();
