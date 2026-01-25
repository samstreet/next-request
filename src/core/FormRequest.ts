import type { NextApiRequest } from 'next';
import type {
  ValidatorAdapter,
  RequestData,
  SupportedRequest,
  ValidationErrors,
} from './types';
import { isAppRouterRequest } from './types';
import { ValidationError, AuthorizationError } from './errors';
import type { RateLimitConfig, RateLimitResult } from '../utils/rateLimit';
import { checkRateLimit, RateLimitError } from '../utils/rateLimit';
import { coerceFormData, type CoercionOptions } from '../utils/coerce';

/**
 * Abstract base class for form request validation.
 * Inspired by Laravel's Form Request pattern.
 *
 * @example
 * ```typescript
 * import { FormRequest, ZodAdapter } from 'next-request';
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 * });
 *
 * export class LoginRequest extends FormRequest<z.infer<typeof schema>> {
 *   rules() {
 *     return new ZodAdapter(schema);
 *   }
 *
 *   async authorize() {
 *     return true; // Allow all requests
 *   }
 *
 *   beforeValidation() {
 *     this.body.email = this.body.email?.toLowerCase().trim();
 *   }
 * }
 * ```
 */
export abstract class FormRequest<TValidated = unknown> {
  /**
   * The original request object
   */
  protected request!: SupportedRequest;

  /**
   * Parsed request body (mutable for beforeValidation hook)
   */
  protected body: Record<string, unknown> = {};

  /**
   * Query parameters from the URL
   */
  protected query: Record<string, string | string[] | undefined> = {};

  /**
   * Route parameters (e.g., /users/[id])
   */
  protected params: Record<string, string> = {};

  /**
   * Request headers
   */
  protected headers: Record<string, string | string[] | undefined> = {};

  /**
   * Validated data (populated after successful validation)
   */
  private _validated: TValidated | null = null;

  /**
   * Partial validated data (fields that passed validation)
   */
  private _safe: Partial<TValidated> = {};

  // ─────────────────────────────────────────────────────────────
  // ABSTRACT METHODS (must be implemented by subclasses)
  // ─────────────────────────────────────────────────────────────

  /**
   * Define the validation rules for this request.
   * Return a ValidatorAdapter instance (e.g., ZodAdapter, YupAdapter).
   */
  abstract rules(): ValidatorAdapter<TValidated>;

  // ─────────────────────────────────────────────────────────────
  // LIFECYCLE HOOKS (can be overridden)
  // ─────────────────────────────────────────────────────────────

  /**
   * Determine if the user is authorized to make this request.
   * Override this method to add authorization logic.
   *
   * @returns true if authorized, false otherwise
   */
  authorize(): boolean | Promise<boolean> {
    return true;
  }

  /**
   * Define rate limiting for this request.
   * Override this method to add rate limiting.
   *
   * @example
   * ```typescript
   * rateLimit() {
   *   return {
   *     maxAttempts: 5,
   *     windowMs: 60000, // 1 minute
   *     key: (req) => this.input('email') || 'anonymous',
   *   };
   * }
   * ```
   */
  rateLimit(): RateLimitConfig | null {
    return null;
  }

  /**
   * Define coercion options for form data.
   * Override this method to enable automatic type coercion.
   *
   * @example
   * ```typescript
   * coercion() {
   *   return {
   *     booleans: true,  // "true" → true
   *     numbers: true,   // "123" → 123
   *     dates: true,     // "2024-01-01" → Date
   *   };
   * }
   * ```
   */
  coercion(): CoercionOptions | null {
    return null;
  }

  /**
   * Called before validation runs.
   * Use this to normalize or transform input data.
   *
   * @example
   * ```typescript
   * beforeValidation() {
   *   this.body.email = this.body.email?.toLowerCase().trim();
   * }
   * ```
   */
  beforeValidation(): void | Promise<void> {}

  /**
   * Called after validation succeeds.
   * Use this for logging, analytics, or post-processing.
   *
   * @param data The validated data
   */
  afterValidation(_data: TValidated): void | Promise<void> {}

  /**
   * Called when validation fails.
   * Use this for logging or custom error handling.
   *
   * @param errors The validation errors
   */
  onValidationFailed(_errors: ValidationErrors): void | Promise<void> {}

  /**
   * Called when authorization fails.
   * Use this for logging or custom error handling.
   */
  onAuthorizationFailed(): void | Promise<void> {}

  // ─────────────────────────────────────────────────────────────
  // CUSTOM MESSAGES (can be overridden)
  // ─────────────────────────────────────────────────────────────

  /**
   * Custom validation error messages.
   * Keys can be field names or "field.rule" patterns.
   *
   * @example
   * ```typescript
   * messages() {
   *   return {
   *     'email.email': 'Please provide a valid email address',
   *     'password.min': 'Password must be at least 8 characters',
   *   };
   * }
   * ```
   */
  messages(): Record<string, string> {
    return {};
  }

  /**
   * Custom attribute names for error messages.
   * Used to replace field names in error messages.
   *
   * @example
   * ```typescript
   * attributes() {
   *   return {
   *     'email': 'email address',
   *     'dob': 'date of birth',
   *   };
   * }
   * ```
   */
  attributes(): Record<string, string> {
    return {};
  }

  // ─────────────────────────────────────────────────────────────
  // STATIC FACTORY METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a FormRequest instance from an App Router Request.
   *
   * @param request The incoming Request object
   * @param params Route parameters (from params in route handler)
   */
  static async fromAppRouter<T extends FormRequest>(
    this: new () => T,
    request: Request,
    params: Record<string, string> = {}
  ): Promise<T> {
    const instance = new this();
    instance.request = request;
    instance.params = params;

    // Parse headers
    instance.headers = {};
    request.headers.forEach((value, key) => {
      instance.headers[key] = value;
    });

    // Parse query from URL
    const url = new URL(request.url);
    instance.query = {};
    url.searchParams.forEach((value, key) => {
      const existing = instance.query[key];
      if (existing !== undefined) {
        instance.query[key] = Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
      } else {
        instance.query[key] = value;
      }
    });

    // Parse body for appropriate methods
    const method = request.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      try {
        const contentType = request.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          instance.body = await request.clone().json();
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const text = await request.clone().text();
          const formData = new URLSearchParams(text);
          instance.body = Object.fromEntries(formData.entries());
        } else if (contentType.includes('multipart/form-data')) {
          const formData = await request.clone().formData();
          instance.body = Object.fromEntries(formData.entries());
        }
      } catch {
        instance.body = {};
      }
    }

    return instance;
  }

  /**
   * Create a FormRequest instance from a Pages Router NextApiRequest.
   *
   * @param request The incoming NextApiRequest object
   * @param params Route parameters
   */
  static async fromPagesRouter<T extends FormRequest>(
    this: new () => T,
    request: NextApiRequest,
    params: Record<string, string> = {}
  ): Promise<T> {
    const instance = new this();
    instance.request = request;
    instance.params = { ...params, ...(request.query as Record<string, string>) };

    // Parse headers
    instance.headers = request.headers as Record<string, string | string[] | undefined>;

    // Parse query - Next.js already parses this
    instance.query = request.query as Record<string, string | string[] | undefined>;

    // Body is already parsed by Next.js
    instance.body = (request.body as Record<string, unknown>) ?? {};

    return instance;
  }

  // ─────────────────────────────────────────────────────────────
  // CORE VALIDATION METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Run validation and return the validated data.
   * Throws ValidationError if validation fails.
   * Throws AuthorizationError if authorization fails.
   * Throws RateLimitError if rate limit is exceeded.
   *
   * @returns The validated data with full type inference
   */
  async validate(): Promise<TValidated> {
    // Check rate limit first
    const rateLimitConfig = this.rateLimit();
    if (rateLimitConfig) {
      const result = await checkRateLimit(this.request, rateLimitConfig);
      if (!result.allowed) {
        throw new RateLimitError(result, rateLimitConfig.message);
      }
    }

    // Check authorization
    const isAuthorized = await this.authorize();
    if (!isAuthorized) {
      await this.onAuthorizationFailed();
      throw new AuthorizationError();
    }

    // Apply coercion if configured
    const coercionOptions = this.coercion();
    if (coercionOptions) {
      this.body = coerceFormData(this.body, coercionOptions);
    }

    // Run beforeValidation hook
    await this.beforeValidation();

    // Get the validator and run validation
    const validator = this.rules();
    const result = await validator.validate(this.getDataForValidation(), {
      messages: this.messages(),
      attributes: this.attributes(),
    });

    if (!result.success) {
      const errors = result.errors ?? { _error: ['Validation failed'] };
      await this.onValidationFailed(errors);
      throw new ValidationError(errors);
    }

    // Store validated data
    this._validated = result.data!;
    this._safe = result.data as Partial<TValidated>;

    // Run afterValidation hook
    await this.afterValidation(this._validated);

    return this._validated;
  }

  /**
   * Get the validated data (after calling validate()).
   * Throws if validate() hasn't been called successfully.
   */
  validated(): TValidated {
    if (this._validated === null) {
      throw new Error(
        'Cannot access validated data before calling validate(). ' +
        'Call validate() first and handle any errors.'
      );
    }
    return this._validated;
  }

  /**
   * Get only the fields that passed validation.
   * Safe to call even if validation hasn't completed.
   */
  safe(): Partial<TValidated> {
    return { ...this._safe };
  }

  /**
   * Get raw input data (body merged with query for GET requests).
   */
  all(): Record<string, unknown> {
    return { ...this.body };
  }

  /**
   * Get a specific input value.
   */
  input<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const value = this.body[key] ?? this.query[key];
    return (value as T) ?? defaultValue;
  }

  /**
   * Check if input has a specific key.
   */
  has(key: string): boolean {
    return key in this.body || key in this.query;
  }

  /**
   * Get only specified keys from input.
   */
  only<K extends string>(...keys: K[]): Pick<Record<string, unknown>, K> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (this.has(key)) {
        result[key] = this.input(key);
      }
    }
    return result as Pick<Record<string, unknown>, K>;
  }

  /**
   * Get all input except specified keys.
   */
  except(...keys: string[]): Record<string, unknown> {
    const result = { ...this.body };
    for (const key of keys) {
      delete result[key];
    }
    return result;
  }

  /**
   * Get the original request object.
   */
  getRequest(): SupportedRequest {
    return this.request;
  }

  /**
   * Check if this is an App Router request.
   */
  isAppRouter(): boolean {
    return isAppRouterRequest(this.request);
  }

  /**
   * Get a header value.
   */
  header(name: string): string | string[] | undefined {
    const lowerName = name.toLowerCase();
    if (isAppRouterRequest(this.request)) {
      return this.request.headers.get(lowerName) ?? undefined;
    }
    return this.headers[lowerName];
  }

  /**
   * Get a route parameter.
   */
  param(name: string): string | undefined {
    return this.params[name];
  }

  // ─────────────────────────────────────────────────────────────
  // PROTECTED HELPERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the data that will be validated.
   * Override this to customize what data is passed to the validator.
   */
  protected getDataForValidation(): unknown {
    return this.body;
  }
}

export default FormRequest;
