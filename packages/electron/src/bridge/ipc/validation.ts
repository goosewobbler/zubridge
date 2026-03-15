import type { Action } from '@zubridge/types';
import { z } from 'zod';

/**
 * Validation schemas for IPC payloads using Zod.
 *
 * These schemas provide:
 * - Type-safe validation of all IPC inputs from renderer processes
 * - Protection against injection attacks and DoS via length limits
 * - Consistent validation across single and batch dispatch
 * - Better error messages for debugging
 */

/**
 * Maximum lengths for string fields to prevent DoS attacks
 */
const MAX_STRING_LENGTH = {
  ACTION_TYPE: 200,
  ACTION_ID: 100,
  BATCH_ID: 100,
  PARENT_ID: 100,
} as const;

/**
 * Maximum batch size to prevent DoS attacks.
 *
 * This is an absolute hard limit that cannot be overridden by configuration.
 *
 * Rationale for 200:
 * - ActionBatcher sends ~50 actions/batch in normal operation (BATCHING_DEFAULTS.maxBatchSize)
 * - ActionBatcher queue limit is maxBatchSize * 4 = 200 (proven safe in production)
 * - This limit provides 4x safety margin while preventing abuse from compromised renderers
 * - Normal operation never approaches this limit
 * - Consistent with existing architecture (4x multiplier used in ActionBatcher)
 *
 * Security model:
 * - Normal operation: ≤50 actions/batch (ActionBatcher controlled)
 * - Hard security cap: ≤200 actions/batch (Zod validation - catches malicious/buggy batches)
 */
const MAX_BATCH_SIZE = 200;

/**
 * Schema for validating Action payloads from renderer
 * Matches the Action type from @zubridge/types but enforces runtime validation
 */
export const ActionPayloadSchema = z
  .object({
    type: z.string().min(1).max(MAX_STRING_LENGTH.ACTION_TYPE),
    payload: z.unknown().optional(),
    __id: z.string().max(MAX_STRING_LENGTH.ACTION_ID).optional(),
    __bypassAccessControl: z.boolean().optional(),
    __immediate: z.boolean().optional(),
    __startsThunk: z.boolean().optional(),
    __sourceWindowId: z.number().optional(),
  })
  .strict(); // Reject unknown properties

/**
 * Known fields in ActionPayloadSchema - these are kept for validation.
 * Fields starting with __ that are NOT in this list will be stripped.
 */
const KNOWN_ACTION_FIELDS = new Set([
  'type',
  'payload',
  '__id',
  '__bypassAccessControl',
  '__immediate',
  '__startsThunk',
  '__sourceWindowId',
]);

/**
 * Strips internal __-prefixed fields from an action object before validation.
 * Only strips fields that start with __ but are NOT in the known action fields list.
 * Fields in the schema (like __id, __immediate) are kept for validation.
 * @param action - The action object to sanitize (must be a plain object)
 * @returns Action object with unknown internal fields removed, or original if not an object
 */
function stripInternalFields(action: unknown): unknown {
  // Guard: only process plain objects
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return action;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(action)) {
    // Keep if it's not __-prefixed, OR if it's a known schema field
    if (!key.startsWith('__') || KNOWN_ACTION_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Schema for single action dispatch payload
 * Used by handleDispatch
 */
export const SingleDispatchPayloadSchema = z
  .object({
    action: ActionPayloadSchema,
    parentId: z.string().max(MAX_STRING_LENGTH.PARENT_ID).optional(),
  })
  .strict();

/**
 * Schema for individual actions within a batch
 */
export const BatchActionItemSchema = z
  .object({
    action: ActionPayloadSchema,
    id: z.string().min(1).max(MAX_STRING_LENGTH.ACTION_ID),
    parentId: z.string().max(MAX_STRING_LENGTH.PARENT_ID).optional(),
  })
  .strict();

/**
 * Schema for batch dispatch payload
 * Used by handleBatchDispatch
 */
export const BatchDispatchPayloadSchema = z
  .object({
    batchId: z.string().min(1).max(MAX_STRING_LENGTH.BATCH_ID),
    actions: z.array(BatchActionItemSchema).min(1).max(MAX_BATCH_SIZE),
  })
  .strict();

/**
 * Inferred TypeScript types from Zod schemas
 */
export type ValidatedAction = z.infer<typeof ActionPayloadSchema>;
export type ValidatedSingleDispatch = z.infer<typeof SingleDispatchPayloadSchema>;
export type ValidatedBatchActionItem = z.infer<typeof BatchActionItemSchema>;
export type ValidatedBatchDispatch = z.infer<typeof BatchDispatchPayloadSchema>;

/**
 * Validation result type for better error handling
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: z.ZodError };

/**
 * Validates a single action dispatch payload
 * @param data - Unknown data from IPC channel
 * @returns Validation result with typed data or error message
 */
export function validateSingleDispatch(data: unknown): ValidationResult<ValidatedSingleDispatch> {
  // Strip internal __-prefixed fields from action before validation
  if (data && typeof data === 'object' && 'action' in data) {
    const sanitizedData = {
      ...data,
      action: stripInternalFields((data as { action: Record<string, unknown> }).action),
    };
    const result = SingleDispatchPayloadSchema.safeParse(sanitizedData);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      error: formatZodError(result.error),
      details: result.error,
    };
  }

  const result = SingleDispatchPayloadSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: formatZodError(result.error),
    details: result.error,
  };
}

/**
 * Validates a batch dispatch payload
 * @param data - Unknown data from IPC channel
 * @returns Validation result with typed data or error message
 */
export function validateBatchDispatch(data: unknown): ValidationResult<ValidatedBatchDispatch> {
  // Guard: validate data structure before processing
  if (data && typeof data === 'object' && 'actions' in data) {
    const rawData = data as Record<string, unknown>;
    const rawActions = rawData.actions;

    // If actions is not an array, skip sanitization and let Zod report the error
    // uniformly via BatchDispatchPayloadSchema.safeParse below.
    if (!Array.isArray(rawActions)) {
      const result = BatchDispatchPayloadSchema.safeParse(rawData);
      return result.success
        ? { success: true, data: result.data as ValidatedBatchDispatch }
        : { success: false, error: formatZodError(result.error), details: result.error };
    }

    // Strip internal __-prefixed fields from each action in the batch
    const sanitizedActions = rawActions.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const rawItem = item as Record<string, unknown>;
        return {
          ...rawItem,
          action: stripInternalFields(rawItem.action),
        };
      }
      // Pass through as-is so Zod reports a clear type error
      // (e.g. "Expected object, received number") rather than a
      // misleading "id: Required" from wrapping in { action: item }.
      return item;
    });

    const sanitizedData = {
      ...rawData,
      actions: sanitizedActions,
    };
    const result = BatchDispatchPayloadSchema.safeParse(sanitizedData);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      error: formatZodError(result.error),
      details: result.error,
    };
  }

  const result = BatchDispatchPayloadSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: formatZodError(result.error),
    details: result.error,
  };
}

/**
 * Formats Zod validation errors into human-readable messages
 * @param error - Zod validation error
 * @returns Formatted error message
 */
function formatZodError(error: z.ZodError): string {
  if (error.issues.length === 0) {
    return 'Invalid payload structure';
  }

  const uniqueIssues = [
    ...new Set(
      error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
    ),
  ];

  const summary = uniqueIssues.slice(0, 3).join('; ');
  return uniqueIssues.length > 3 ? `${summary} (+${uniqueIssues.length - 3} more)` : summary;
}

/**
 * Type guard to check if Action is valid (used for narrowing types)
 * This is a runtime check that matches the Zod schema
 */
export function isValidAction(action: unknown): action is Action {
  return ActionPayloadSchema.safeParse(action).success;
}

/**
 * Validation levels for renderer-side validation
 */
export type RendererValidationLevel = 'off' | 'warn' | 'error';

/**
 * Get the renderer validation level from environment
 * Defaults to 'warn' in development, 'off' in production
 */
export function getRendererValidationLevel(): RendererValidationLevel {
  // Check environment variable first
  const envLevel = process.env.ZUBRIDGE_RENDERER_VALIDATION as RendererValidationLevel | undefined;
  if (envLevel === 'off' || envLevel === 'warn' || envLevel === 'error') {
    return envLevel;
  }

  // Default: warn in development, off in production
  return process.env.NODE_ENV === 'development' ? 'warn' : 'off';
}

/**
 * Validates an action in the renderer process
 * Used by preload script to validate actions before sending to main
 *
 * @param action - The action to validate
 * @param parentId - Optional parent thunk ID
 * @param level - Validation level (defaults to environment-based)
 */
export function validateActionInRenderer(
  action: unknown,
  parentId?: string,
  level: RendererValidationLevel = getRendererValidationLevel(),
): void {
  // Skip validation if disabled
  if (level === 'off') {
    return;
  }

  // Validate the action
  const result = validateSingleDispatch({ action, parentId });

  if (!result.success) {
    const message = `[Zubridge] Invalid action dispatch: ${result.error}`;
    const details = {
      action,
      parentId,
      error: result.error,
      validationDetails: result.details,
    };

    if (level === 'error') {
      // Throw error in strict mode
      console.error(message, details);
      throw new Error(message);
    }
    // Log warning in warn mode
    console.warn(message, details);
  }
}
