#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync, StdioOptions } from 'node:child_process';

interface PackageJson {
  version: string;
  name: string;
  workspaces?: string[];
}

// --- Helper Functions ---

function readPackageJson(pkgPath: string): PackageJson | undefined {
  const fullPath = path.resolve(pkgPath);
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      console.error(`Error reading or parsing ${fullPath}:`, error.message);
      return undefined;
    }
  }
}

// Simplified runCommand: always executes, returns stdout
function runCommand(command: string): string {
  console.log(`Executing: ${command}`);
  try {
    const stdioOptions: StdioOptions = ['pipe', 'pipe', 'pipe'];
    const output = execSync(command, {
      stdio: stdioOptions,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    // Log output for specific commands
    if (command.includes('DEBUG=true pnpm package-versioner') || command.startsWith('git diff')) {
      if (output) {
        console.log('--- Command Output ---');
        console.log(output.trim());
        console.log('--- End Command Output ---');
      } else {
        console.log('--- Command executed successfully, but produced no stdout. ---');
      }
    }
    return output || '';
  } catch (error: any) {
    console.error(`Error executing command: ${command}`);
    if (error.stdout && error.stdout.length > 0) {
      console.error('--- STDOUT on Error ---');
      console.error(error.stdout.toString().trim());
      console.error('--- End STDOUT on Error ---');
    }
    if (error.stderr && error.stderr.length > 0) {
      console.error('--- STDERR on Error ---');
      console.error(error.stderr.toString().trim());
      console.error('--- End STDERR on Error ---');
    }
    process.exit(1);
  }
}

// Helper to strip scope (e.g., @zubridge/) if present
function getUnscopedPackageName(pkgName: string): string {
  return pkgName.includes('/') ? pkgName.split('/')[1] : pkgName;
}

// Function to get the FULL package name (scoped if present) from local file
function getScopedPackageName(simpleName: string): string | null {
  const pkgJsonPath = path.join('packages', simpleName, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = readPackageJson(pkgJsonPath);
    return pkgJson ? pkgJson.name : null;
  }

  // For Rust packages, package-versioner is expected to handle them directly
  // using their appropriate scoped name, so we just use the simple name
  return simpleName;
}

// --- Main Logic ---

async function main() {
  // Read Inputs
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
  console.log(`Workspace Root: ${workspaceRoot}`);

  process.chdir(workspaceRoot);

  // --- Log all package versions first ---
  console.log('\n========== CURRENT PACKAGE VERSIONS ==========');
  // Find all packages and log their versions
  const packagesDir = path.join(workspaceRoot, 'packages');
  if (fs.existsSync(packagesDir)) {
    const packages = fs.readdirSync(packagesDir);
    for (const pkg of packages) {
      const pkgJsonPath = path.join(packagesDir, pkg, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkgJson = readPackageJson(pkgJsonPath);
          if (pkgJson) {
            console.log(`📦 ${pkgJson.name}: ${pkgJson.version}`);
          }
        } catch (error) {
          console.warn(`Warning: Could not read package.json for ${pkg}`);
        }
      }
    }
  }
  console.log('=============================================\n');

  // Check package-versioner version
  try {
    const packageVersionerVersion = execSync('pnpm list package-versioner --json', { encoding: 'utf-8' });
    console.log('📝 package-versioner info:');
    console.log(packageVersionerVersion);
  } catch (error) {
    console.log('Could not determine package-versioner version');
  }

  // --- Determine Targets ---
  let targets: string[] = [];

  // Process input as a comma-separated list (even for single packages)
  const packageList = packagesInput.includes(',')
    ? packagesInput
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : [packagesInput.trim()];

  for (const pkg of packageList) {
    // Get the unscoped name (handles both @zubridge/something and plain names)
    const simpleName = getUnscopedPackageName(pkg);

    // Add the package to targets if it exists in the workspace
    // package-versioner will handle the appropriate package type
    const packagePath = path.resolve(`packages/${simpleName}`);
    if (fs.existsSync(packagePath)) {
      targets.push(simpleName);
    } else {
      console.warn(`::warning::Package ${pkg} (simple name: ${simpleName}) not found, skipping`);
    }
  }

  console.log(`Using specified targets: ${targets.join(', ')}`);

  // Convert simple target names back to scoped names for the -t flag
  const scopedTargets: string[] = [];
  for (const simpleName of targets) {
    const scopedName = getScopedPackageName(simpleName);
    if (scopedName) {
      scopedTargets.push(scopedName);
    } else {
      console.warn(`::warning::Could not get scoped name for target '${simpleName}'. Skipping.`);
    }
  }

  if (scopedTargets.length === 0) {
    console.error('Error: No valid target packages could be determined. Check INPUT_PACKAGES and package existence.');
    process.exit(1);
  }
  console.log(`Effective scoped targets for -t flag: ${scopedTargets.join(', ')}`);

  // --- Reference Package Info ---
  // Use the first package in our targets list as the reference package
  if (targets.length === 0) {
    console.error('Error: No valid target packages available to use as a reference.');
    process.exit(1);
  }

  const refPkgSimpleName = targets[0];
  const refPkgPath = path.join('packages', refPkgSimpleName, 'package.json');

  if (scopedTargets.length === 0) {
    console.error('Error: No valid scoped target packages available to use as a reference.');
    process.exit(1);
  }

  const refPkgScopedName = scopedTargets[0];

  console.log(`Using ${refPkgScopedName} as reference package for version determination`);

  // Add debug logging to show current package versions
  console.log('\n--- Current Package Versions ---');
  for (const simpleName of targets) {
    // Log package.json version if available
    const pkgJsonPath = path.join('packages', simpleName, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkgJson = readPackageJson(pkgJsonPath);
      if (pkgJson) {
        console.log(`${pkgJson.name}: ${pkgJson.version}`);
      }
    } else {
      // For packages without package.json (like Rust packages)
      console.log(`${simpleName}: Version managed by package-versioner`);
    }
  }
  console.log('--- End Current Package Versions ---\n');

  // --- Construct package-versioner Command ---
  let packageVersionerCmd = 'pnpm package-versioner';

  // Add flags based on release type input
  if (['patch', 'minor', 'major'].includes(releaseVersionInput)) {
    packageVersionerCmd += ` --bump ${releaseVersionInput}`;

    // Log the existing version.config.json if it exists
    const existingConfigPath = path.join(workspaceRoot, 'version.config.json');
    if (fs.existsSync(existingConfigPath)) {
      try {
        const existingConfig = fs.readFileSync(existingConfigPath, 'utf8');
        console.log('\n🔍 Existing version.config.json:');
        console.log(existingConfig);
      } catch (error) {
        console.warn('Could not read existing version.config.json');
      }
    } else {
      console.log('No existing version.config.json found');
    }
  } else if (releaseVersionInput.startsWith('pre')) {
    let identifier = 'beta'; // Default identifier for 'prerelease'
    if (releaseVersionInput.includes(':')) {
      // Extract identifier if present (e.g., prerelease:rc -> rc)
      const parts = releaseVersionInput.split(':');
      if (parts.length > 1 && parts[1]) {
        identifier = parts[1];
      }
    } else {
      // Handle simple prepatch, preminor, premajor
      if (releaseVersionInput !== 'prerelease') {
        // Use the type itself as the identifier, tool should handle it
        identifier = releaseVersionInput.substring(3); // e.g., prepatch -> patch
      }
    }
    packageVersionerCmd += ` --bump ${identifier} --prerelease`;
  } else {
    console.error(
      `Error: Invalid INPUT_RELEASE_VERSION value: ${releaseVersionInput}. Expected patch, minor, major, or pre*`,
    );
    process.exit(1);
  }

  // Add dry-run flag if applicable
  if (dryRun) {
    packageVersionerCmd += ' --dry-run';
  }

  // Add JSON output flag for structured output
  packageVersionerCmd += ' --json';

  // Add target flag (now always added, as we handle 'all' by finding all packages)
  const targetsArg = scopedTargets.join(',');
  packageVersionerCmd += ` -t ${targetsArg}`;

  // --- Execute Command and Determine Version ---
  let newVersion: string | null = null;

  // Use the original command string built earlier
  const commandToExecute = packageVersionerCmd;

  if (dryRun) {
    console.log('\n--- Dry Run: Calculating Version via package-versioner output ---');
    const commandOutput = runCommand(commandToExecute);

    try {
      // Parse JSON output
      const jsonOutput = JSON.parse(commandOutput);

      // Extract version from the reference package in the updates array
      const refPackageUpdate = jsonOutput.updates?.find((update: any) => update.packageName === refPkgScopedName);

      if (refPackageUpdate && refPackageUpdate.newVersion) {
        newVersion = refPackageUpdate.newVersion;
        console.log(`Dry run: Determined next version for ${refPkgScopedName} would be: ${newVersion}`);
      } else {
        throw new Error(`Could not find ${refPkgScopedName} in the updates array`);
      }
    } catch (error: any) {
      console.error(`Error: Could not parse JSON output from package-versioner: ${error.message}`);
      console.error('Full output was:\n' + commandOutput);

      // Fall back to reading current version for non-Rust packages
      const pkgJsonPath = path.join('packages', refPkgSimpleName, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const currentPkgJson = readPackageJson(pkgJsonPath);
        if (currentPkgJson) {
          newVersion = currentPkgJson.version;
          console.warn(`::warning::Falling back to current version '${newVersion}' from package.json due to parsing error.`);
        } else {
          console.error(`Error: Could not read current version from ${pkgJsonPath}.`);
          process.exit(1); // Exit if we can't determine a version
        }
      } else {
        console.error(`Error: Reference package ${refPkgScopedName} does not have a package.json and JSON parsing failed.`);
        process.exit(1);
      }
    }
  } else {
    // Actual Run
    console.log('\n--- Actual Run: Applying Version via package-versioner ---');
    const commandOutput = runCommand(commandToExecute);

    try {
      // Parse JSON output
      const jsonOutput = JSON.parse(commandOutput);

      // Extract version from the reference package in the updates array
      const refPackageUpdate = jsonOutput.updates?.find((update: any) => update.packageName === refPkgScopedName);

      if (refPackageUpdate && refPackageUpdate.newVersion) {
        newVersion = refPackageUpdate.newVersion;
        console.log(`Version bumped to: ${newVersion} (from JSON output)`);
      } else {
        // Fall back to reading from package.json if JSON parsing fails
        throw new Error(`Could not find ${refPkgScopedName} in the updates array`);
      }
    } catch (error: any) {
      console.error(`Error parsing JSON output: ${error.message}`);
      console.error('Falling back to reading updated version from package.json if available');

      // Check if reference package has a package.json for fallback
      if (fs.existsSync(refPkgPath)) {
        const updatedPkgJson = readPackageJson(refPkgPath);
        if (updatedPkgJson && updatedPkgJson.version) {
          newVersion = updatedPkgJson.version;
          console.log(`Version bumped to: ${newVersion} (from package.json)`);
        } else {
          console.error(`Error: Could not read updated version from ${refPkgPath} after package-versioner run.`);
          process.exit(1);
        }
      } else {
        console.error(`Error: Reference package ${refPkgScopedName} does not have a package.json for fallback version reading.`);
        process.exit(1);
      }
    }
  }

  // --- Output the Determined Version ---
  if (!newVersion) {
    console.error('Error: Failed to determine new version.');
    process.exit(1);
  }

  const githubOutputFile = process.env.GITHUB_OUTPUT;
  if (githubOutputFile) {
    console.log(`\nAppending new_version=${newVersion} to ${githubOutputFile}`);
    await fs.promises.appendFile(githubOutputFile, `new_version=${newVersion}\n`);
  } else {
    console.error(
      'Error: GITHUB_OUTPUT environment variable not set. This script expects to be run in a GitHub Actions environment where GITHUB_OUTPUT is automatically provided.',
    );
    process.exit(1);
  }

  console.log('\nScript finished successfully.');
}

// Execute main function
main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
