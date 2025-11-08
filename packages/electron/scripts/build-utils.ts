/**
 * Checks if an ID should be externalized.
 * We externalize @oxc-project/runtime because it has bundling compatibility issues.
 * It needs to be available as a runtime dependency.
 */
export function externalizeUnenvRuntime(id: string): boolean {
  // Normalize path separators to forward slashes for consistent checking
  const normalized = id.replace(/\\/g, '/');

  // Externalize @oxc-project/runtime modules (they cause bundling issues)
  // These will be resolved at runtime, so they need to be available as dependencies
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
  return {
    name: 'unenv-external',
    load(id: string) {
      // Intercept @oxc-project/runtime modules and add default export
      // These are CommonJS modules that need a default export for ESM compatibility
      if (id.includes('@oxc-project/runtime')) {
        // Return null to let rolldown load it normally, but we'll transform it
        return null;
      }
      return null;
    },
    resolveId(id: string) {
      // Mark @oxc-project/runtime modules for special handling
      if (id.includes('@oxc-project/runtime')) {
        // Return the id to let rolldown resolve it, but we'll transform it
        return null;
      }
      return null;
    },
    transform(code: string, id: string) {
      // Fix imports from @oxc-project/runtime in unenv's code
      // unenv imports default from @oxc-project/runtime but it doesn't export default
      if (id.includes('unenv') && code.includes('@oxc-project/runtime')) {
        // Fix default imports from @oxc-project/runtime
        // Change: import defineProperty from '@oxc-project/runtime/helpers/defineProperty'
        // To: import * as defineProperty from '@oxc-project/runtime/helpers/defineProperty'
        const fixed = code.replace(
          /import\s+(\w+)\s+from\s+['"]@oxc-project\/runtime([^'"]*)['"]/g,
          (match, importName, path) => {
            // Change default import to namespace import
            return `import * as ${importName} from '@oxc-project/runtime${path}'`;
          },
        );
        if (fixed !== code) {
          return { code: fixed, map: null };
        }
      }

      // Fix @oxc-project/runtime modules to export default
      // These are CommonJS modules that need ESM default export
      // The id might be a virtual module ID like \0@oxc-project+runtime@...
      if (id.includes('@oxc-project/runtime') || id.includes('oxc-project+runtime')) {
        // If it's a CommonJS module, ensure it has a default export
        // Most @oxc-project/runtime modules use module.exports
        if (code.includes('module.exports') || code.includes('module.exports =')) {
          // Add ESM default export if not present
          if (!code.includes('export default') && !code.includes('export { default }')) {
            // Convert CommonJS to ESM with default export
            // Remove any existing module.exports assignment and add export default
            const fixed = code.replace(
              /module\.exports\s*=\s*([^;]+);?/g,
              'const __exports = $1;\nexport default __exports;',
            );
            if (fixed !== code) {
              return { code: fixed, map: null };
            }
            // Fallback: just add export default
            return { code: `${code}\nexport default module.exports;`, map: null };
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

      if (transformed !== code) {
        return { code: transformed, map: null };
      }
      return null;
    },
  };
}
