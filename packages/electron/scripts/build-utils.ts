/**
 * Externalize unenv runtime modules to avoid bundling issues.
 * Unenv's runtime code uses @oxc-project/runtime which has compatibility issues
 * when bundled with rolldown/tsdown, so we externalize it.
 */
export function externalizeUnenvRuntime(id: string): boolean {
  // Normalize path separators to forward slashes for consistent checking
  const normalized = id.replace(/\\/g, '/');
  return normalized.includes('unenv/dist/runtime') || normalized.includes('unenv/runtime');
}
