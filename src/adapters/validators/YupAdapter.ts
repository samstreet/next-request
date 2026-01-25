import type { ValidatorAdapter, ValidationResult, ValidationConfig, ValidationErrors } from '../../core/types';

// Yup types - defined locally to avoid hard dependency
interface YupValidationError {
  inner: YupValidationError[];
  path?: string;
  message: string;
  type?: string;
  name: string;
}

interface YupSchema<T> {
  validate(data: unknown, options?: { abortEarly?: boolean; stripUnknown?: boolean }): Promise<T>;
  validateSync(data: unknown, options?: { abortEarly?: boolean; stripUnknown?: boolean }): T;
}

/**
 * Validator adapter for Yup schemas
 *
 * @example
 * ```typescript
 * import * as yup from 'yup';
 * import { YupAdapter } from 'next-request';
 *
 * const schema = yup.object({
 *   email: yup.string().email().required(),
 *   name: yup.string().min(2).required(),
 * });
 *
 * class MyRequest extends FormRequest<yup.InferType<typeof schema>> {
 *   rules() {
 *     return new YupAdapter(schema);
 *   }
 * }
 * ```
 */
export class YupAdapter<T> implements ValidatorAdapter<T> {
  constructor(private schema: YupSchema<T>) {}

  async validate(data: unknown, config?: ValidationConfig): Promise<ValidationResult<T>> {
    try {
      const validated = await this.schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
      });

      return {
        success: true,
        data: validated as T,
      };
    } catch (error) {
      if (this.isYupValidationError(error)) {
        const errors = this.formatYupErrors(error, config);
        return {
          success: false,
          errors,
        };
      }
      throw error;
    }
  }

  validateSync(data: unknown, config?: ValidationConfig): ValidationResult<T> {
    try {
      const validated = this.schema.validateSync(data, {
        abortEarly: false,
        stripUnknown: true,
      });

      return {
        success: true,
        data: validated as T,
      };
    } catch (error) {
      if (this.isYupValidationError(error)) {
        const errors = this.formatYupErrors(error, config);
        return {
          success: false,
          errors,
        };
      }
      throw error;
    }
  }

  private isYupValidationError(error: unknown): error is YupValidationError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'inner' in error &&
      'name' in error &&
      (error as { name: string }).name === 'ValidationError'
    );
  }

  private formatYupErrors(error: YupValidationError, config?: ValidationConfig): ValidationErrors {
    const errors: ValidationErrors = {};
    const customMessages = config?.messages ?? {};
    const customAttributes = config?.attributes ?? {};

    // Handle case where there are no inner errors (single error)
    const innerErrors = error.inner.length > 0 ? error.inner : [error];

    for (const issue of innerErrors) {
      const path = issue.path ?? '_root';

      // Get custom attribute name if available
      const attributeName = customAttributes[path] ?? path;

      // Build the message key for custom messages (e.g., "email.email", "password.min")
      const messageKey = `${path}.${issue.type ?? 'invalid'}`;

      // Check for custom message, otherwise use Yup's message with custom attribute
      let message: string;
      if (customMessages[messageKey]) {
        message = customMessages[messageKey];
      } else if (customMessages[path]) {
        message = customMessages[path];
      } else {
        // Replace field references in Yup's default message
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
