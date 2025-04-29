// Publish script for the project - publishes the packages to the npm registry
// Usage: tsx scripts/publish.ts [option1] [option2] [...]
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Centralized error handling function
function handleError(message: string, exitCode = 1): never {
  console.error(`Error: ${message}`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
let tag = 'latest';
let filterPackages: string[] = [];

// Process args
const options: string[] = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--tag' && i + 1 < args.length) {
    tag = args[i + 1];
    i++; // Skip the next arg since we've used it
  } else if (arg.startsWith('--tag=')) {
    // Handle --tag=latest format
    tag = arg.split('=')[1];
  } else if (arg === '--filter' && i + 1 < args.length) {
    // Process potentially comma-separated package paths or names
    const filterValues = args[i + 1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    filterPackages.push(...filterValues);
    i++; // Skip the next arg since we've used it
  } else if (arg.startsWith('--filter=')) {
    // Handle --filter=./packages/pkg format
    const filterValue = arg.split('=')[1].trim();
    if (filterValue) {
      filterPackages.push(filterValue);
    }
  } else {
    options.push(arg);
  }
}

// Function to find all packages in the packages directory
function findPackagesToPublish(): string[] {
  const packagesDir = path.join(process.cwd(), 'packages');

  // Ensure the packages directory exists
  if (!fs.existsSync(packagesDir)) {
    handleError('Packages directory not found');
  }

  // Get directories in the packages folder
  const packageDirs = fs.readdirSync(packagesDir);

  // Create a map of package names to directories
  const packageMap: Record<string, string> = {};
  for (const dir of packageDirs) {
    const packageJsonPath = path.join(packagesDir, dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageMap[packageJson.name] = dir;
      } catch (err) {
        console.warn(`Could not parse package.json in ${dir}: ${err}`);
      }
    }
  }

  // If we have specific packages to filter
  if (filterPackages.length > 0) {
    // Set to track unique package directories to publish
    const packagesToPublishSet = new Set<string>();

    for (const filter of filterPackages) {
      // Handle paths like ./packages/electron
      if (filter.startsWith('./packages/') || filter.startsWith('packages/')) {
        const dirName = filter.replace(/^\.?\/packages\//, '');
        if (packageDirs.includes(dirName)) {
          packagesToPublishSet.add(dirName);
        } else {
          handleError(`Package directory "${dirName}" not found in packages folder`);
        }
      }
      // Handle package names like @zubridge/electron
      else if (filter.startsWith('@zubridge/')) {
        const packageName = filter;
        const dirName = packageMap[packageName];
        if (dirName) {
          packagesToPublishSet.add(dirName);
        } else {
          handleError(`Package "${packageName}" not found in packages folder`);
        }
      }
      // Handle simple directory names like 'electron'
      else {
        if (packageDirs.includes(filter)) {
          packagesToPublishSet.add(filter);
        } else {
          // Only use exact matches for package names
          const matchingPackages = Object.keys(packageMap).filter((name) => name === filter);
          if (matchingPackages.length > 0) {
            for (const pkg of matchingPackages) {
              packagesToPublishSet.add(packageMap[pkg]);
            }
          } else {
            handleError(`Package "${filter}" not found in packages folder. Only exact matches are allowed.`);
          }
        }
      }
    }

    console.log('Publishing requested packages:');
    return Array.from(packagesToPublishSet).map((dir) => path.join('packages', dir));
  }

  // If no filter specified, don't publish anything by default - require explicit selection
  console.log('No packages specified with --filter. Please provide specific packages.');
  return [];
}

// Find packages to publish
const packagesToPublish = findPackagesToPublish();

if (packagesToPublish.length === 0) {
  console.log('No packages found to publish');
  process.exit(0);
}

console.log(`Publishing packages with tag "${tag}":`);
packagesToPublish.forEach((pkg) => console.log(`- ${pkg}`));

// Construct filter argument for pnpm publish
const filterArgs = packagesToPublish.map((pkg) => `--filter ./${pkg}`).join(' ');

// Create and run the publish command
const publishCommand = `pnpm publish ${filterArgs} --access public --no-git-checks --tag ${tag} ${options.join(' ')}`;

console.log(`\nRunning: ${publishCommand}\n`);

try {
  execSync(publishCommand, { stdio: 'inherit' });
  console.log('Packages published successfully!');
} catch (error) {
  handleError(`Failed to publish packages: ${error}`);
}
