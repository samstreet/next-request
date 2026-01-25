import type { ValidatorAdapter, ValidationResult, ValidationConfig, ValidationErrors } from '../../core/types';

// Valibot types - defined locally to avoid hard dependency
interface ValibotIssue {
  path?: Array<{ key: string | number } | string | number>;
  message?: string;
  type?: string;
}

interface SafeParseResult<T> {
  success: boolean;
  output?: T;
  issues?: ValibotIssue[];
}

// Generic schema type for Valibot
interface ValibotSchema<TOutput = unknown> {
  _output?: TOutput;
}

/**
 * Validator adapter for Valibot schemas
 *
 * @example
 * ```typescript
 * import * as v from 'valibot';
 * import { ValibotAdapter } from 'next-request';
 *
 * const schema = v.object({
 *   email: v.pipe(v.string(), v.email()),
 *   name: v.pipe(v.string(), v.minLength(2)),
 * });
 *
 * class MyRequest extends FormRequest<v.InferOutput<typeof schema>> {
 *   rules() {
 *     return new ValibotAdapter(schema);
 *   }
 * }
 * ```
 */
export class ValibotAdapter<T> implements ValidatorAdapter<T> {
  private safeParse: (schema: ValibotSchema<T>, data: unknown) => SafeParseResult<T>;

  constructor(
    private schema: ValibotSchema<T>,
    safeParseFunc?: (schema: ValibotSchema<T>, data: unknown) => SafeParseResult<T>
  ) {
    // Allow injecting safeParse for flexibility with different Valibot versions
    this.safeParse = safeParseFunc ?? this.defaultSafeParse.bind(this);
  }

  private defaultSafeParse(schema: ValibotSchema<T>, data: unknown): SafeParseResult<T> {
    // Dynamic import to avoid requiring valibot at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const valibot = require('valibot');
    return valibot.safeParse(schema, data);
  }

  async validate(data: unknown, config?: ValidationConfig): Promise<ValidationResult<T>> {
    return this.validateSync(data, config);
  }

  validateSync(data: unknown, config?: ValidationConfig): ValidationResult<T> {
    const result = this.safeParse(this.schema, data);

    if (result.success) {
      return {
        success: true,
        data: result.output,
      };
    }

    const errors = this.formatValibotErrors(result.issues ?? [], config);

    return {
      success: false,
      errors,
    };
  }

  private formatValibotErrors(issues: ValibotIssue[], config?: ValidationConfig): ValidationErrors {
    const errors: ValidationErrors = {};
    const customMessages = config?.messages ?? {};
    const customAttributes = config?.attributes ?? {};

    for (const issue of issues) {
      // Valibot uses path array similar to Zod
      const pathParts = issue.path?.map((p: { key: string | number } | string | number) => {
        if (typeof p === 'object' && p !== null && 'key' in p) {
          return String(p.key);
        }
        return String(p);
      }) ?? [];
      const path = pathParts.join('.') || '_root';

      // Get custom attribute name if available
      const attributeName = customAttributes[path] ?? path;

      // Build the message key for custom messages
      const messageKey = `${path}.${issue.type ?? 'invalid'}`;

      // Check for custom message, otherwise use Valibot's message with custom attribute
      let message: string;
      if (customMessages[messageKey]) {
        message = customMessages[messageKey];
      } else if (customMessages[path]) {
        message = customMessages[path];
      } else {
        // Replace field references in Valibot's default message
        message = (issue.message ?? 'Validation failed').replace(
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
