/**
 * Externalize unenv runtime modules to avoid bundling issues.
 * Unenv's runtime code uses @oxc-project/runtime which has compatibility issues
 * when bundled with rolldown/tsdown, so we externalize it.
 *
 * Also externalizes:
 * - Unenv module IDs (e.g., "unenv/node/crypto") to prevent them from being resolved to absolute paths
 * - Absolute paths that point to unenv runtime modules to prevent Windows path backslashes
 *   from causing "Invalid Unicode escape sequence" errors
 */
export function externalizeUnenvRuntime(id: string): boolean {
  // Normalize path separators to forward slashes for consistent checking
  const normalized = id.replace(/\\/g, '/');

  // Check for unenv module IDs (before resolution to absolute paths)
  if (normalized.startsWith('unenv/')) {
    return true;
  }

  // Check for absolute paths (starting with / or drive letter) that point to unenv
  if (/^([A-Z]:)?\//.test(normalized) && normalized.includes('unenv')) {
    return true;
  }

  // Check for unenv runtime paths (legacy check for compatibility)
  return normalized.includes('unenv/dist/runtime') || normalized.includes('unenv/runtime');
}

/**
 * Creates a rolldown plugin that:
 * 1. Transforms `node:` imports to `unenv/node/...` module IDs in source code
 * 2. Externalizes unenv modules to prevent bundling
 *
 * This bypasses rolldown's alias resolution which causes absolute paths to be written.
 */
export function createUnenvExternalPlugin() {
  return {
    name: 'unenv-external',
    transform(code: string, _id: string) {
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
    resolveId(id: string) {
      // Externalize unenv modules
      if (externalizeUnenvRuntime(id)) {
        return { id, external: true };
      }
      return null;
    },
  };
}
