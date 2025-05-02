#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

interface PackageJson {
  version: string;
  name: string;
}

// Read package.json from a given path
function readPackageJson(pkgPath: string): PackageJson | undefined {
  try {
    const content = fs.readFileSync(path.resolve(pkgPath), 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    console.error(`Error reading or parsing ${pkgPath}:`, error.message);
    return undefined;
  }
}

// Execute a command and return its output
function runCommand(command: string): string {
  console.log(`Executing: ${command}`);
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return output;
  } catch (error: any) {
    console.error(`Error executing command: ${command}`);
    if (error.stdout) console.error(error.stdout.toString().trim());
    if (error.stderr) console.error(error.stderr.toString().trim());
    process.exit(1);
  }
}

// Strip scope from package name
function getUnscopedPackageName(pkgName: string): string {
  return pkgName.includes('/') ? pkgName.split('/')[1] : pkgName;
}

// Get full scoped package name
function getScopedPackageName(simpleName: string): string | null {
  const pkgJsonPath = path.join('packages', simpleName, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = readPackageJson(pkgJsonPath);
    return pkgJson ? pkgJson.name : null;
  }
  return simpleName;
}

async function main() {
  // Read inputs
  const packagesInput = process.env.INPUT_PACKAGES || '';
  const releaseVersionInput = process.env.INPUT_RELEASE_VERSION;
  const dryRun = process.env.INPUT_DRY_RUN === 'true';
  const workspaceRoot = process.env.GITHUB_WORKSPACE || '.';

  if (!releaseVersionInput) {
    console.error('Error: INPUT_RELEASE_VERSION is required.');
    process.exit(1);
  }

  console.log(`Release Version Input: ${releaseVersionInput}`);
  console.log(`Dry Run: ${dryRun}`);
  process.chdir(workspaceRoot);

  // Log current package versions
  console.log('\n========== CURRENT PACKAGE VERSIONS ==========');
  const packagesDir = path.join(workspaceRoot, 'packages');
  if (fs.existsSync(packagesDir)) {
    const packages = fs.readdirSync(packagesDir);
    for (const pkg of packages) {
      const pkgJson = readPackageJson(path.join(packagesDir, pkg, 'package.json'));
      if (pkgJson) {
        console.log(`📦 ${pkgJson.name}: ${pkgJson.version}`);
      }
    }
  }
  console.log('=============================================\n');

  // Get target packages
  const packageList = packagesInput.includes(',')
    ? packagesInput.split(',').map((p) => p.trim()).filter(Boolean)
    : [packagesInput.trim()];

  const targets: string[] = [];
  for (const pkg of packageList) {
    const simpleName = getUnscopedPackageName(pkg);
    const packagePath = path.resolve(`packages/${simpleName}`);
    if (fs.existsSync(packagePath)) {
      targets.push(simpleName);
    } else {
      console.warn(`Warning: Package ${pkg} not found, skipping`);
    }
  }

  if (targets.length === 0) {
    console.error('Error: No valid target packages specified.');
    process.exit(1);
  }

  // Get scoped target names
  const scopedTargets = targets
    .map(simpleName => getScopedPackageName(simpleName))
    .filter(Boolean) as string[];

  console.log(`Using specified targets: ${targets.join(', ')}`);
  console.log(`Effective scoped targets: ${scopedTargets.join(', ')}`);

  // Reference package for version calculation
  const refPkgSimpleName = targets[0];
  const refPkgScopedName = scopedTargets[0];
  console.log(`Using ${refPkgScopedName} as reference package for version determination`);

  // Determine version bump flag based on input
  let bumpFlag: string;

  if (['patch', 'minor', 'major'].includes(releaseVersionInput)) {
    bumpFlag = `--bump ${releaseVersionInput}`;
  } else if (releaseVersionInput === 'prerelease') {
    // Correct way to handle prerelease increment
    bumpFlag = '--bump prerelease';
  } else if (releaseVersionInput.startsWith('pre')) {
    // Handle prefixed releases like prepatch, preminor, premajor
    if (releaseVersionInput.includes(':')) {
      const [type, identifier] = releaseVersionInput.split(':');
      bumpFlag = `--bump ${type} --preid ${identifier}`;
    } else {
      bumpFlag = `--bump ${releaseVersionInput}`;
    }
  } else {
    console.error(`Error: Invalid release version: ${releaseVersionInput}`);
    process.exit(1);
  }

  // Build package-versioner command
  const targetsArg = scopedTargets.join(',');
  const packageVersionerCmd = [
    'pnpm package-versioner',
    bumpFlag,
    dryRun ? '--dry-run' : '',
    '--json',
    `-t ${targetsArg}`
  ].filter(Boolean).join(' ');

  // Execute command
  let newVersion: string | null = null;
  const commandOutput = runCommand(packageVersionerCmd);

  try {
    // Parse JSON output
    const jsonOutput = JSON.parse(commandOutput);
    const refPackageUpdate = jsonOutput.updates?.find((update: any) => update.packageName === refPkgScopedName);

    if (refPackageUpdate?.newVersion) {
      newVersion = refPackageUpdate.newVersion;
      console.log(`Version ${dryRun ? 'would be' : 'bumped to'}: ${newVersion}`);
    } else {
      throw new Error(`Could not find ${refPkgScopedName} in the updates array`);
    }
  } catch (error: any) {
    console.error(`Error parsing JSON output: ${error.message}`);
    console.log('Falling back to reading version from package.json');

    // Fallback to reading from package.json
    const pkgJsonPath = path.join('packages', refPkgSimpleName, 'package.json');
    const pkgJson = readPackageJson(pkgJsonPath);
    if (pkgJson?.version) {
      newVersion = pkgJson.version;
      console.log(`Using version from package.json: ${newVersion}`);
    } else {
      console.error('Failed to determine version from any source');
      process.exit(1);
    }
  }

  // Output the determined version
  if (!newVersion) {
    console.error('Failed to determine new version');
    process.exit(1);
  }

  const githubOutputFile = process.env.GITHUB_OUTPUT;
  if (githubOutputFile) {
    console.log(`Setting output new_version=${newVersion}`);
    fs.appendFileSync(githubOutputFile, `new_version=${newVersion}\n`);
  } else {
    console.error('GITHUB_OUTPUT environment variable not set');
    process.exit(1);
  }

  console.log('Version calculation completed successfully');
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});

