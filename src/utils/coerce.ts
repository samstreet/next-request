/**
 * Coercion utilities for automatically converting string values from form data
 * to their appropriate JavaScript types.
 */

/**
 * Options for coercion
 */
export interface CoercionOptions {
  /** Coerce "true"/"false" strings to booleans */
  booleans?: boolean;
  /** Coerce numeric strings to numbers */
  numbers?: boolean;
  /** Coerce ISO date strings to Date objects */
  dates?: boolean;
  /** Coerce "null" string to null */
  nulls?: boolean;
  /** Coerce empty strings to undefined */
  emptyStrings?: boolean;
  /** Coerce JSON strings to objects/arrays */
  json?: boolean;
  /** Custom coercion functions for specific fields */
  fields?: Record<string, (value: unknown) => unknown>;
}

const defaultOptions: CoercionOptions = {
  booleans: true,
  numbers: true,
  dates: true,
  nulls: true,
  emptyStrings: false,
  json: false,
};

/**
 * Check if a string looks like an ISO date
 */
function isIsoDateString(value: string): boolean {
  // ISO 8601 date patterns
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?)?$/;
  return isoDateRegex.test(value);
}

/**
 * Check if a string is a valid number
 */
function isNumericString(value: string): boolean {
  if (value === '' || value === null) return false;
  // Don't coerce strings that look like IDs or codes (leading zeros, too long, etc.)
  if (/^0\d/.test(value)) return false; // Leading zero (like "01234")
  if (value.length > 15) return false; // Too long to be a safe number
  return !isNaN(Number(value)) && isFinite(Number(value));
}

/**
 * Coerce a single value based on options
 */
function coerceValue(value: unknown, options: CoercionOptions): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  // Empty string handling
  if (options.emptyStrings && value === '') {
    return undefined;
  }

  // Null handling
  if (options.nulls && value === 'null') {
    return null;
  }

  // Boolean handling
  if (options.booleans) {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  // Date handling (check before numbers to avoid coercing "2024" to a number when it might be a year)
  if (options.dates && isIsoDateString(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Number handling
  if (options.numbers && isNumericString(value)) {
    return Number(value);
  }

  // JSON handling
  if (options.json) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        // Not valid JSON, return as string
      }
    }
  }

  return value;
}

/**
 * Recursively coerce values in an object
 */
function coerceObject(
  data: Record<string, unknown>,
  options: CoercionOptions,
  path: string = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const fieldPath = path ? `${path}.${key}` : key;

    // Check for custom field coercion
    if (options.fields && options.fields[fieldPath]) {
      result[key] = options.fields[fieldPath](value);
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((item, index) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          return coerceObject(item as Record<string, unknown>, options, `${fieldPath}.${index}`);
        }
        return coerceValue(item, options);
      });
    } else if (value !== null && typeof value === 'object') {
      result[key] = coerceObject(value as Record<string, unknown>, options, fieldPath);
    } else {
      result[key] = coerceValue(value, options);
    }
  }

  return result;
}

/**
 * Coerce form data values to their appropriate JavaScript types.
 *
 * Form submissions typically send everything as strings. This function
 * automatically converts common patterns:
 * - "true" / "false" → boolean
 * - "123" / "45.67" → number
 * - "2024-01-01" → Date
 * - "null" → null
 *
 * @example
 * ```typescript
 * const formData = {
 *   name: "John",
 *   age: "25",
 *   active: "true",
 *   createdAt: "2024-01-01",
 * };
 *
 * const coerced = coerceFormData(formData);
 * // {
 * //   name: "John",
 * //   age: 25,
 * //   active: true,
 * //   createdAt: Date("2024-01-01"),
 * // }
 * ```
 */
export function coerceFormData<T extends Record<string, unknown>>(
  data: T,
  options: CoercionOptions = {}
): T {
  const mergedOptions = { ...defaultOptions, ...options };
  return coerceObject(data, mergedOptions) as T;
}

/**
 * Create a Zod preprocessor for automatic coercion
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { zodCoerce } from 'next-request';
 *
 * const schema = z.preprocess(
 *   zodCoerce(),
 *   z.object({
 *     name: z.string(),
 *     age: z.number(),
 *     active: z.boolean(),
 *   })
 * );
 * ```
 */
export function zodCoerce(options: CoercionOptions = {}): (data: unknown) => unknown {
  return (data: unknown) => {
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      return coerceFormData(data as Record<string, unknown>, options);
    }
    return data;
  };
}

/**
 * Common coercion presets
 */
export const coercionPresets = {
  /** Coerce all supported types */
  all: { booleans: true, numbers: true, dates: true, nulls: true, emptyStrings: true, json: true },
  /** Only coerce booleans and numbers (safest) */
  safe: { booleans: true, numbers: true, dates: false, nulls: false, emptyStrings: false, json: false },
  /** Coerce booleans, numbers, and dates */
  standard: { booleans: true, numbers: true, dates: true, nulls: false, emptyStrings: false, json: false },
  /** No coercion */
  none: { booleans: false, numbers: false, dates: false, nulls: false, emptyStrings: false, json: false },
} satisfies Record<string, CoercionOptions>;
