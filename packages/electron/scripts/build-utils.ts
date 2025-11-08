import { createRequire } from 'node:module';

/**
 * Checks if an ID should be externalized.
 * We externalize @oxc-project/runtime because it has bundling compatibility issues.
 * It's available as a regular dependency, so users don't need to install it manually.
 */
export function externalizeUnenvRuntime(id: string): boolean {
  // Normalize path separators to forward slashes for consistent checking
  const normalized = id.replace(/\\/g, '/');

  // Externalize @oxc-project/runtime modules (they cause bundling issues)
  // These will be resolved at runtime via the regular dependency
  if (normalized.includes('@oxc-project/runtime')) {
    return true;
  }

  // Don't externalize unenv polyfill modules - they should be bundled
  return false;
}

/**
 * Creates a rolldown plugin that:
 * 1. Transforms `node:` imports to `unenv/node/...` module IDs in source code
 * 2. Fixes @oxc-project/runtime import issues (handles missing default exports)
 * 3. Rewrites absolute unenv paths in the output to relative paths or module IDs
 *
 * This allows unenv modules to be bundled while preventing Windows path issues.
 */
export function createUnenvExternalPlugin() {
  // Create require function for module resolution (synchronous)
  const requireFn = createRequire(import.meta.url);

  // Lazy-load fs module when needed (async)
  let fs: typeof import('node:fs') | undefined;

  const getFs = async (): Promise<typeof import('node:fs')> => {
    if (!fs) {
      const fsModule = await import('node:fs');
      fs = fsModule.default || fsModule;
    }
    return fs;
  };

  return {
    name: 'unenv-external',
    resolveId(id: string, importer?: string) {
      // Intercept @oxc-project/runtime imports from unenv and rewrite them
      // This happens before rolldown tries to resolve, so we can fix the import
      if (importer?.includes('unenv') && id.includes('@oxc-project/runtime')) {
        // Return a virtual module ID that we'll handle in the load hook
        // This prevents rolldown from trying to resolve the problematic import
        return `\0virtual:${id}`;
      }

      // For other @oxc-project/runtime imports, let rolldown resolve normally
      if (id.includes('@oxc-project/runtime')) {
        return null;
      }

      return null;
    },
    async load(id: string) {
      // Handle virtual modules created in resolveId
      if (id.startsWith('\0virtual:@oxc-project/runtime')) {
        // Extract the original module path and load it
        const originalPath = id.replace('\0virtual:', '');
        try {
          const fsModule = await getFs();
          // Try to resolve and load the actual module
          const resolvedPath = requireFn.resolve(originalPath);
          const code = fsModule.readFileSync(resolvedPath, 'utf8');
          // Transform CommonJS to ESM
          const transformed = code.replace(/module\.exports\s*=\s*([^;]+);/g, 'export default $1;');
          return transformed;
        } catch {
          // If we can't load it, return null to let rolldown handle it
          return null;
        }
      }

      // Intercept @oxc-project/runtime modules to transform them
      if (id.includes('@oxc-project/runtime') && !id.startsWith('\0')) {
        try {
          const fsModule = await getFs();
          const resolvedPath = requireFn.resolve(id);
          const code = fsModule.readFileSync(resolvedPath, 'utf8');
          // Transform CommonJS to ESM
          const transformed = code.replace(/module\.exports\s*=\s*([^;]+);/g, 'export default $1;');
          return transformed;
        } catch {
          // If we can't load it, return null to let rolldown handle it
          return null;
        }
      }
      return null;
    },
    transform(code: string, id: string) {
      // Fix imports from @oxc-project/runtime in ANY code (especially unenv's code)
      // unenv imports default from @oxc-project/runtime but it doesn't export default
      // We need to fix this before rolldown tries to resolve the import
      if (code.includes('@oxc-project/runtime')) {
        // Debug: log when we find @oxc-project/runtime imports
        if (process.env.DEBUG_BUILD) {
          console.log('[transform] Found @oxc-project/runtime in', id);
          const matches = code.match(
            /import\s+(\w+)\s+from\s+['"]@oxc-project\/runtime([^'"]*)['"]/g,
          );
          if (matches) {
            console.log('[transform] Found imports:', matches);
          }
        }

        // Fix default imports from @oxc-project/runtime
        // Change: import defineProperty from '@oxc-project/runtime/helpers/defineProperty'
        // To: import * as defineProperty from '@oxc-project/runtime/helpers/defineProperty'
        let fixed = code.replace(
          /import\s+(\w+)\s+from\s+['"]@oxc-project\/runtime([^'"]*)['"]/g,
          (match, importName, path) => {
            if (process.env.DEBUG_BUILD) {
              console.log(
                `[transform] Replacing: ${match} -> import * as ${importName} from '@oxc-project/runtime${path}'`,
              );
            }
            // Change default import to namespace import
            return `import * as ${importName} from '@oxc-project/runtime${path}'`;
          },
        );

        // Also handle dynamic imports
        fixed = fixed.replace(
          /import\s*\(\s*['"]@oxc-project\/runtime([^'"]*)['"]\s*\)/g,
          (_match) => {
            // For dynamic imports, we can't easily change to namespace, so we'll handle it differently
            // Return the import as-is for now, the module will be transformed to export default
            return _match;
          },
        );

        if (fixed !== code) {
          if (process.env.DEBUG_BUILD) {
            console.log(
              `[transform] Transformed ${id}, changed ${(code.match(/@oxc-project\/runtime/g) || []).length} occurrences`,
            );
          }
          return { code: fixed, map: null };
        }
      }

      // Transform @oxc-project/runtime CommonJS modules to ESM
      // These modules use module.exports but need to export default for ESM
      if (id.includes('@oxc-project/runtime') || id.includes('oxc-project+runtime')) {
        // Check if it's already ESM
        if (code.includes('export ')) {
          return null;
        }

        // Convert CommonJS to ESM
        // Pattern: module.exports = function() {...} or module.exports = value
        if (code.includes('module.exports')) {
          // Replace module.exports = ... with export default
          let transformed = code;

          // Handle: module.exports = value;
          transformed = transformed.replace(
            /module\.exports\s*=\s*([^;]+);/g,
            'export default $1;',
          );

          // Handle: module.exports.__esModule = true; module.exports.default = module.exports;
          // This is a CommonJS interop pattern, we can remove it
          transformed = transformed.replace(
            /module\.exports\.__esModule\s*=\s*true[^;]*;?\s*/g,
            '',
          );
          transformed = transformed.replace(
            /module\.exports\["default"\]\s*=\s*module\.exports[^;]*;?\s*/g,
            '',
          );

          // If we still have module.exports references, wrap them
          if (transformed.includes('module.exports') && !transformed.includes('export default')) {
            // Wrap the entire module
            transformed = `const __module = {};\n(function(module) {\n${transformed}\n})(__module);\nexport default __module.exports;`;
          }

          if (transformed !== code) {
            return { code: transformed, map: null };
          }
        }

        return null;
      }

      // Transform node: imports to unenv module IDs
      // This applies to both source files and bundled dependencies (like weald)
      if (code.includes('node:')) {
        // Transform node: imports to unenv module IDs
        // Example: import { randomUUID } from 'node:crypto'
        //          -> import { randomUUID } from 'unenv/node/crypto'
        const transformed = code
          .replace(/from\s+['"]node:([^'"]+)['"]/g, "from 'unenv/node/$1'")
          .replace(/import\s+\(['"]node:([^'"]+)['"]\)/g, "import('unenv/node/$1')");

        if (transformed !== code) {
          return { code: transformed, map: null };
        }
      }
      return null;
    },
    renderChunk(code: string) {
      // Rewrite absolute unenv paths to module IDs in the output
      // This prevents Windows path separator issues
      // Match absolute paths to unenv runtime modules
      // Example: require("/Users/.../unenv/dist/runtime/node/crypto.mjs")
      //          -> require("unenv/node/crypto")
      let transformed = code;

      // Handle require() statements with absolute paths
      transformed = transformed.replace(
        /require\(["']([^"']*unenv[^"']*[\\/]dist[\\/]runtime[\\/]node[\\/]([^"']+))\.m?js["']\)/g,
        (_match, _fullPath, moduleName) => {
          return `require("unenv/node/${moduleName}")`;
        },
      );

      // Also handle import() statements
      transformed = transformed.replace(
        /import\(["']([^"']*unenv[^"']*[\\/]dist[\\/]runtime[\\/]node[\\/]([^"']+))\.m?js["']\)/g,
        (_match, _fullPath, moduleName) => {
          return `import("unenv/node/${moduleName}")`;
        },
      );

      // Remove @oxc-project/runtime imports from renderer output
      // These can't be resolved in browser context, so we need to remove them
      // The _defineProperty is only used by unenv's bundled code, and we can replace it with a no-op
      if (transformed.includes('@oxc-project/runtime')) {
        // Remove the import statement
        transformed = transformed.replace(
          /import\s+(\w+)\s+from\s+["']@oxc-project\/runtime[^"']*["'];\s*/g,
          (match, importName) => {
            if (process.env.DEBUG_BUILD) {
              console.log(`[renderChunk] Removing import: ${match}`);
            }
            // Replace with a no-op function that matches the expected signature
            // _defineProperty is used by unenv's code, but we can provide a polyfill
            return `const ${importName} = Object.defineProperty;\n`;
          },
        );

        // Also handle namespace imports
        transformed = transformed.replace(
          /import\s+\*\s+as\s+(\w+)\s+from\s+["']@oxc-project\/runtime[^"']*["'];\s*/g,
          (match, importName) => {
            if (process.env.DEBUG_BUILD) {
              console.log(`[renderChunk] Removing namespace import: ${match}`);
            }
            // Replace with a no-op object
            return `const ${importName} = { default: Object.defineProperty };\n`;
          },
        );
      }

      if (transformed !== code) {
        if (process.env.DEBUG_BUILD) {
          console.log('[renderChunk] Transformed chunk, changed code');
        }
        return { code: transformed, map: null };
      }
      return null;
    },
  };
}
