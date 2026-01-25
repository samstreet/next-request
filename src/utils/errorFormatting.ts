import type { ValidationErrors } from '../core/types';

/**
 * Options for error formatting
 */
export interface ErrorFormattingOptions {
  /** Include field path in error messages */
  includePath?: boolean;
  /** Custom path separator for nested fields */
  pathSeparator?: string;
  /** Maximum number of errors per field */
  maxErrorsPerField?: number;
  /** Include array indices in paths */
  includeArrayIndices?: boolean;
}

/**
 * Structured error format for nested objects and arrays
 */
export interface StructuredErrors {
  /** Flat errors (field path → messages) */
  flat: ValidationErrors;
  /** Nested errors matching the original object structure */
  nested: Record<string, unknown>;
  /** Array of all error messages */
  all: string[];
  /** Count of total errors */
  count: number;
  /** Check if a specific field has errors */
  has(field: string): boolean;
  /** Get errors for a specific field */
  get(field: string): string[];
  /** Get first error for a specific field */
  first(field: string): string | undefined;
}

/**
 * Parse a dot-notation path into segments
 */
function parsePath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const parts = path.split('.');

  for (const part of parts) {
    // Check for array notation like "items[0]" or just "0"
    const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
    if (arrayMatch) {
      segments.push(arrayMatch[1]);
      segments.push(parseInt(arrayMatch[2], 10));
    } else if (/^\d+$/.test(part)) {
      segments.push(parseInt(part, 10));
    } else {
      segments.push(part);
    }
  }

  return segments;
}

/**
 * Set a value at a nested path in an object
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: (string | number)[],
  value: unknown
): void {
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];
    const keyStr = String(key);

    if (!(keyStr in current)) {
      // Create array or object based on next key type
      current[keyStr] = typeof nextKey === 'number' ? [] : {};
    }

    current = current[keyStr] as Record<string, unknown>;
  }

  const lastKey = String(path[path.length - 1]);
  current[lastKey] = value;
}

/**
 * Format validation errors with improved support for nested objects and arrays.
 *
 * @example
 * ```typescript
 * const errors = {
 *   'user.email': ['Invalid email'],
 *   'items.0.name': ['Name is required'],
 *   'items.1.price': ['Price must be positive'],
 * };
 *
 * const formatted = formatErrors(errors);
 * // formatted.nested = {
 * //   user: { email: ['Invalid email'] },
 * //   items: [
 * //     { name: ['Name is required'] },
 * //     { price: ['Price must be positive'] },
 * //   ],
 * // }
 * ```
 */
export function formatErrors(
  errors: ValidationErrors,
  options: ErrorFormattingOptions = {}
): StructuredErrors {
  const { maxErrorsPerField } = options;

  const flat: ValidationErrors = {};
  const nested: Record<string, unknown> = {};
  const all: string[] = [];

  for (const [field, messages] of Object.entries(errors)) {
    // Apply max errors per field limit
    const limitedMessages = maxErrorsPerField
      ? messages.slice(0, maxErrorsPerField)
      : messages;

    // Store flat errors
    flat[field] = limitedMessages;

    // Add to all errors
    all.push(...limitedMessages);

    // Build nested structure
    const path = parsePath(field);
    setNestedValue(nested, path, limitedMessages);
  }

  return {
    flat,
    nested,
    all,
    count: all.length,
    has(field: string): boolean {
      return field in flat && flat[field].length > 0;
    },
    get(field: string): string[] {
      return flat[field] ?? [];
    },
    first(field: string): string | undefined {
      return flat[field]?.[0];
    },
  };
}

/**
 * Flatten nested errors into dot-notation paths
 *
 * @example
 * ```typescript
 * const nested = {
 *   user: { email: ['Invalid email'] },
 *   items: [
 *     { name: ['Name is required'] },
 *   ],
 * };
 *
 * const flat = flattenErrors(nested);
 * // { 'user.email': ['Invalid email'], 'items.0.name': ['Name is required'] }
 * ```
 */
export function flattenErrors(
  nested: Record<string, unknown>,
  options: ErrorFormattingOptions = {}
): ValidationErrors {
  const { pathSeparator = '.', includeArrayIndices = true } = options;
  const result: ValidationErrors = {};

  function flatten(obj: unknown, prefix: string = ''): void {
    if (Array.isArray(obj)) {
      // Check if it's an array of error messages (strings)
      if (obj.every((item) => typeof item === 'string')) {
        result[prefix] = obj as string[];
        return;
      }

      // It's an array of nested objects
      obj.forEach((item, index) => {
        const key = includeArrayIndices
          ? `${prefix}${prefix ? pathSeparator : ''}${index}`
          : prefix;
        flatten(item, key);
      });
    } else if (obj !== null && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const newPrefix = prefix ? `${prefix}${pathSeparator}${key}` : key;
        flatten(value, newPrefix);
      }
    }
  }

  flatten(nested);
  return result;
}

/**
 * Get human-readable error summary
 */
export function summarizeErrors(errors: ValidationErrors): string {
  const entries = Object.entries(errors);
  if (entries.length === 0) {
    return 'No errors';
  }

  if (entries.length === 1) {
    const [field, messages] = entries[0];
    return `${field}: ${messages[0]}`;
  }

  const totalErrors = entries.reduce((sum, [, msgs]) => sum + msgs.length, 0);
  return `${totalErrors} validation error${totalErrors > 1 ? 's' : ''} in ${entries.length} field${entries.length > 1 ? 's' : ''}`;
}

/**
 * Filter errors to only include specific fields
 */
export function filterErrors(
  errors: ValidationErrors,
  fields: string[]
): ValidationErrors {
  const result: ValidationErrors = {};
  for (const field of fields) {
    if (errors[field]) {
      result[field] = errors[field];
    }
    // Also check for nested fields
    for (const [key, messages] of Object.entries(errors)) {
      if (key.startsWith(`${field}.`)) {
        result[key] = messages;
      }
    }
  }
  return result;
}

/**
 * Merge multiple error objects
 */
export function mergeErrors(...errorSets: ValidationErrors[]): ValidationErrors {
  const result: ValidationErrors = {};
  for (const errors of errorSets) {
    for (const [field, messages] of Object.entries(errors)) {
      if (!result[field]) {
        result[field] = [];
      }
      result[field].push(...messages);
    }
  }
  return result;
}
