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

  // Create a map of package names to their relative paths from the project root
  const packageMap: Record<string, string> = {};

  // Find all package.json files - package-versioner handles the relationships
  // between parent and nested packages, so we just need to find the publishable packages
  for (const dir of packageDirs) {
    const packageDirPath = path.join(packagesDir, dir);

    // Skip if not a directory
    if (!fs.statSync(packageDirPath).isDirectory()) continue;

    // Check for package.json at the root level of this package
    const packageJsonPath = path.join(packageDirPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        // Only register packages that have a name and should be published
        if (packageJson.name && !packageJson.private) {
          packageMap[packageJson.name] = `packages/${dir}`;
        }
      } catch (err) {
        console.warn(`Could not parse package.json in ${dir}: ${err}`);
      }
    }

    // Check for nested package.json files - these are already handled by package-versioner
    // for version syncing, but we still need to find them for publishing
    const nestedDirs = fs
      .readdirSync(packageDirPath)
      .filter((subdir) => fs.statSync(path.join(packageDirPath, subdir)).isDirectory());

    for (const nestedDir of nestedDirs) {
      const nestedPackageJsonPath = path.join(packageDirPath, nestedDir, 'package.json');
      if (fs.existsSync(nestedPackageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(nestedPackageJsonPath, 'utf8'));
          // Only register packages that have a name and should be published
          if (packageJson.name && !packageJson.private) {
            packageMap[packageJson.name] = `packages/${dir}/${nestedDir}`;
          }
        } catch (err) {
          console.warn(`Could not parse package.json in ${dir}/${nestedDir}: ${err}`);
        }
      }
    }
  }

  // If we have specific packages to filter
  if (filterPackages.length > 0) {
    // Set to track unique package directories to publish
    const packagesToPublishSet = new Set<string>();

    for (const filter of filterPackages) {
      // Ensure filter is a string
      const filterStr = String(filter);

      // Handle paths like ./packages/electron or ./packages/middleware/node
      if (filterStr.startsWith('./packages/') || filterStr.startsWith('packages/')) {
        const relativePath = filterStr.replace(/^\.?\//, '');
        if (fs.existsSync(relativePath)) {
          packagesToPublishSet.add(relativePath);
        } else {
          handleError(`Package directory "${relativePath}" not found`);
        }
      }
      // Handle package names like @zubridge/electron or @zubridge/middleware
      else if (filterStr.startsWith('@zubridge/')) {
        const packageName = filterStr;
        const relativePath = packageMap[packageName];
        if (relativePath) {
          packagesToPublishSet.add(relativePath);
        } else {
          handleError(`Package "${packageName}" not found in any package.json`);
        }
      }
      // Handle simple directory names like 'electron' or 'middleware'
      else {
        // First try to match as directory
        const directMatch = `packages/${filterStr}`;
        if (fs.existsSync(directMatch)) {
          packagesToPublishSet.add(directMatch);
        } else {
          // Try to match as package name
          const matchingPackages = Object.keys(packageMap).filter((name) => name === filterStr);
          if (matchingPackages.length > 0) {
            for (const pkg of matchingPackages) {
              packagesToPublishSet.add(packageMap[pkg]);
            }
          } else {
            handleError(`Package "${filterStr}" not found. Only exact matches are allowed.`);
          }
        }
      }
    }

    console.log('Publishing requested packages:');
    return Array.from(packagesToPublishSet);
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
