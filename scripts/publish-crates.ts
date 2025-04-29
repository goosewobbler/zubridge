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

// List of crates to publish with their paths
const cratesToPublish = [
  {
    name: 'tauri-plugin-zubridge',
    path: 'packages/tauri-plugin-zubridge',
  },
  // Add more crates here if needed
];

console.log(`Publishing Rust crates to crates.io...${dryRun ? ' (DRY RUN)' : ''}`);

// For each crate, check if it exists and publish it
for (const crate of cratesToPublish) {
  const cratePath = path.join(process.cwd(), crate.path);
  const cargoTomlPath = path.join(cratePath, 'Cargo.toml');

  // Check if the crate exists
  if (!fs.existsSync(cargoTomlPath)) {
    handleError(`Cargo.toml not found at ${cargoTomlPath}`);
  }

  console.log(`\nPublishing crate: ${crate.name}`);
  try {
    // Change directory to the crate path
    process.chdir(cratePath);
    console.log(`Changed directory to: ${cratePath}`);

    // Run cargo publish
    const publishCommand = dryRun ? 'cargo publish --dry-run' : 'cargo publish';

    console.log(`Running: ${publishCommand}`);

    if (!dryRun) {
      // Verify crate first (dry run)
      console.log('Verifying crate...');
      execSync('cargo publish --dry-run', { stdio: 'inherit' });
    }

    // Then do the actual publish or just log in dry run mode
    if (dryRun) {
      console.log('DRY RUN: Would publish crate to crates.io');
    } else {
      execSync(publishCommand, { stdio: 'inherit' });
      console.log(`Successfully published ${crate.name} to crates.io`);
    }
  } catch (error) {
    handleError(`Failed to publish crate ${crate.name}: ${error}`);
  } finally {
    // Change back to the original directory
    process.chdir(process.cwd());
  }
}

console.log('\nAll crates published successfully!');
