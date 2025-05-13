// Publish Rust crates to crates.io
// Usage: tsx scripts/publish-crates.ts [--dry-run]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Function to handle errors
function handleError(message: string, exitCode = 1): never {
  console.error(`Error: ${message}`);
  process.exit(exitCode);
}

// Process arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noVerify = args.includes('--no-verify');
const targetPackage = args.find((arg) => !arg.startsWith('--'));

// Ensure targetPackage is a string (not a Symbol) when used
// IMPORTANT: This explicit conversion is necessary to prevent TypeScript warnings
// about implicit Symbol to string conversion
const targetPackageStr = typeof targetPackage === 'string' ? targetPackage : String(targetPackage || '');

// List of known Rust crates to publish with their paths
const knownCrates = [
  {
    name: 'tauri-plugin-zubridge',
    dirName: 'tauri-plugin', // Directory name under packages/
    path: 'packages/tauri-plugin',
  },
  {
    name: 'zubridge-middleware',
    dirName: 'middleware', // Directory name under packages/
    path: 'packages/middleware',
    isHybrid: true,
    hasNodeBindings: true,
  },
  // Add more crates here if needed
];

// Determine which crates to publish
let cratesToPublish = knownCrates;

// If a target package is specified, only publish that package
if (targetPackageStr) {
  // Convert input to string explicitly everywhere
  const inputStr = String(targetPackageStr);
  console.log(`Looking for crates matching: ${inputStr}`);

  cratesToPublish = knownCrates.filter(
    (crate) =>
      crate.name === inputStr ||
      crate.dirName === inputStr ||
      inputStr.endsWith(`/${crate.name}`) ||
      crate.path.includes(inputStr),
  );

  if (cratesToPublish.length === 0) {
    handleError(`No matching crate found for target: ${inputStr}`);
  }
}

console.log(`Publishing Rust crates to crates.io...${dryRun ? ' (DRY RUN)' : ''}`);
console.log(`Target package: ${targetPackageStr || 'All crates'}`);
console.log('Crates to publish:', cratesToPublish.map((c) => `${c.name} (${c.path})`).join(', '));

// For each crate, check if it exists and publish it
for (const crate of cratesToPublish) {
  const cratePath = path.join(process.cwd(), crate.path);
  const cargoTomlPath = path.join(cratePath, 'Cargo.toml');

  // Check if the crate exists
  if (!fs.existsSync(cargoTomlPath)) {
    handleError(`Cargo.toml not found at ${cargoTomlPath}`);
  }

  console.log(`\nPublishing crate: ${crate.name} from directory: ${crate.path}`);
  try {
    // Change directory to the crate path
    process.chdir(cratePath);
    console.log(`Changed directory to: ${cratePath}`);

    // Clean any existing artifacts that might affect the build
    console.log('Cleaning previous build artifacts...');
    execSync('cargo clean', { stdio: 'inherit' });

    // Handle Node.js bindings if present
    if (crate.hasNodeBindings) {
      console.log('Package has Node.js bindings. Ensuring node/ directory build is clean...');
      if (fs.existsSync(path.join(cratePath, 'node'))) {
        // Clean node build artifacts separately
        process.chdir(path.join(cratePath, 'node'));
        execSync('cargo clean', { stdio: 'inherit' });
        // Go back to the main crate directory
        process.chdir(cratePath);
      }
    }

    // Run cargo publish
    let publishCommand = 'cargo publish';
    if (dryRun) publishCommand += ' --dry-run';
    if (noVerify) publishCommand += ' --no-verify';

    console.log(`Running: ${publishCommand}`);

    // Then do the actual publish or just log in dry run mode
    if (dryRun) {
      console.log('DRY RUN: Would publish crate to crates.io');
      execSync(publishCommand, { stdio: 'inherit' });
    } else {
      execSync(publishCommand, { stdio: 'inherit' });
      console.log(`Successfully published ${crate.name} to crates.io`);

      // If this is a hybrid package with Node bindings, package-versioner has already
      // updated the version in all components, so we don't need additional logic
      if (crate.isHybrid) {
        console.log(`This is a hybrid package - package-versioner has synced all component versions`);
      }
    }
  } catch (error) {
    handleError(`Failed to publish crate ${crate.name}: ${error}`);
  } finally {
    // Change back to the original directory
    process.chdir(process.cwd());
  }
}

console.log('\nAll crates published successfully!');
