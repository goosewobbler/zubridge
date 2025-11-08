/**
 * Externalize unenv runtime modules to avoid bundling issues.
 * Unenv's runtime code uses @oxc-project/runtime which has compatibility issues
 * when bundled with rolldown/tsdown, so we externalize it.
 *
 * Also externalizes absolute paths that point to unenv runtime modules to prevent
 * Windows path backslashes from causing "Invalid Unicode escape sequence" errors.
 */
export function externalizeUnenvRuntime(id: string): boolean {
  // Normalize path separators to forward slashes for consistent checking
  const normalized = id.replace(/\\/g, '/');
  return (
    normalized.includes('unenv/dist/runtime') ||
    normalized.includes('unenv/runtime') ||
    // Check for absolute paths (starting with / or drive letter) that point to unenv runtime
    (/^([A-Z]:)?\//.test(normalized) && normalized.includes('unenv'))
  );
}
