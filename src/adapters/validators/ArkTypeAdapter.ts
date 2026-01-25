import type { ValidatorAdapter, ValidationResult, ValidationConfig, ValidationErrors } from '../../core/types';

// ArkType types - we use generics to avoid hard dependency
interface ArkTypeSchema<T = unknown> {
  (data: unknown): T | ArkTypeErrors;
}

interface ArkTypeErrors {
  summary: string;
  errors?: Array<{
    path: string[];
    message: string;
    code?: string;
  }>;
  [Symbol.iterator]?: () => Iterator<{ path: string[]; message: string }>;
}

/**
 * Type guard to check if result is ArkType errors
 */
function isArkTypeErrors(result: unknown): result is ArkTypeErrors {
  return (
    result !== null &&
    typeof result === 'object' &&
    'summary' in result &&
    true
  );
}

/**
 * Validator adapter for ArkType schemas
 *
 * @example
 * ```typescript
 * import { type } from 'arktype';
 * import { ArkTypeAdapter } from 'next-request';
 *
 * const schema = type({
 *   email: 'string.email',
 *   name: 'string >= 2',
 * });
 *
 * class MyRequest extends FormRequest<typeof schema.infer> {
 *   rules() {
 *     return new ArkTypeAdapter(schema);
 *   }
 * }
 * ```
 */
export class ArkTypeAdapter<T> implements ValidatorAdapter<T> {
  constructor(private schema: ArkTypeSchema<T>) {}

  async validate(data: unknown, config?: ValidationConfig): Promise<ValidationResult<T>> {
    return this.validateSync(data, config);
  }

  validateSync(data: unknown, config?: ValidationConfig): ValidationResult<T> {
    const result = this.schema(data);

    if (!isArkTypeErrors(result)) {
      return {
        success: true,
        data: result as T,
      };
    }

    const errors = this.formatArkTypeErrors(result, config);

    return {
      success: false,
      errors,
    };
  }

  private formatArkTypeErrors(arkErrors: ArkTypeErrors, config?: ValidationConfig): ValidationErrors {
    const errors: ValidationErrors = {};
    const customMessages = config?.messages ?? {};
    const customAttributes = config?.attributes ?? {};

    // Try to iterate over errors if possible
    const errorList: Array<{ path: string[]; message: string; code?: string }> = [];

    if (arkErrors.errors && Array.isArray(arkErrors.errors)) {
      errorList.push(...arkErrors.errors);
    } else if (arkErrors[Symbol.iterator]) {
      const iteratorFn = arkErrors[Symbol.iterator];
      if (typeof iteratorFn === 'function') {
        const iterator = iteratorFn.call(arkErrors);
        let result = iterator.next();
        while (!result.done) {
          errorList.push(result.value);
          result = iterator.next();
        }
      }
    } else {
      // Fallback to summary as root error
      errorList.push({
        path: [],
        message: arkErrors.summary,
      });
    }

    for (const issue of errorList) {
      const path = issue.path.join('.') || '_root';

      // Get custom attribute name if available
      const attributeName = customAttributes[path] ?? path;

      // Build the message key for custom messages
      const messageKey = `${path}.${issue.code ?? 'invalid'}`;

      // Check for custom message, otherwise use ArkType's message with custom attribute
      let message: string;
      if (customMessages[messageKey]) {
        message = customMessages[messageKey];
      } else if (customMessages[path]) {
        message = customMessages[path];
      } else {
        // Replace field references in ArkType's default message
        message = issue.message.replace(
          new RegExp(`\\b${path}\\b`, 'gi'),
          attributeName
        );
      }

      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(message);
    }

    return errors;
  }
}
