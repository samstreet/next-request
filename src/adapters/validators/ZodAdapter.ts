import type { ZodSchema, ZodError } from 'zod';
import type { ValidatorAdapter, ValidationResult, ValidationConfig, ValidationErrors } from '../../core/types';

/**
 * Validator adapter for Zod schemas
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { ZodAdapter } from 'next-request/zod';
 *
 * const schema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(2),
 * });
 *
 * class MyRequest extends FormRequest<z.infer<typeof schema>> {
 *   rules() {
 *     return new ZodAdapter(schema);
 *   }
 * }
 * ```
 */
export class ZodAdapter<T> implements ValidatorAdapter<T> {
  constructor(private schema: ZodSchema<T>) {}

  async validate(data: unknown, config?: ValidationConfig): Promise<ValidationResult<T>> {
    return this.validateSync(data, config);
  }

  validateSync(data: unknown, config?: ValidationConfig): ValidationResult<T> {
    const result = this.schema.safeParse(data);

    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    const errors = this.formatZodErrors(result.error, config);

    return {
      success: false,
      errors,
    };
  }

  private formatZodErrors(error: ZodError, config?: ValidationConfig): ValidationErrors {
    const errors: ValidationErrors = {};
    const customMessages = config?.messages ?? {};
    const customAttributes = config?.attributes ?? {};

    for (const issue of error.issues) {
      const path = issue.path.join('.');
      const fieldName = path || '_root';

      // Get custom attribute name if available
      const attributeName = customAttributes[fieldName] ?? fieldName;

      // Build the message key for custom messages (e.g., "email.email", "password.min")
      const messageKey = `${fieldName}.${issue.code}`;

      // Check for custom message, otherwise use Zod's message with custom attribute
      let message: string;
      if (customMessages[messageKey]) {
        message = customMessages[messageKey];
      } else if (customMessages[fieldName]) {
        message = customMessages[fieldName];
      } else {
        // Replace field references in Zod's default message
        message = issue.message.replace(
          new RegExp(`\\b${fieldName}\\b`, 'gi'),
          attributeName
        );
      }

      if (!errors[fieldName]) {
        errors[fieldName] = [];
      }
      errors[fieldName].push(message);
    }

    return errors;
  }
}
