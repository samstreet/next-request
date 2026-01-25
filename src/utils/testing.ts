import type { ValidationErrors } from '../core/types';
import { FormRequest } from '../core/FormRequest';
import { ValidationError, AuthorizationError } from '../core/errors';

/**
 * Result of a mock validation
 */
export interface MockValidationResult<T> {
  /** Whether validation succeeded */
  success: boolean;
  /** Validated data (if successful) */
  data?: T;
  /** Validation errors (if failed) */
  errors?: ValidationErrors;
  /** Whether authorization was denied */
  unauthorized?: boolean;
  /** The FormRequest instance */
  instance: FormRequest<T>;
}

/**
 * Options for creating a mock request
 */
export interface MockRequestOptions {
  /** HTTP method */
  method?: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Query parameters */
  query?: Record<string, string>;
  /** Route parameters */
  params?: Record<string, string>;
  /** Base URL for the request */
  baseUrl?: string;
}

/**
 * Create a mock Request object for testing
 */
export function createMockRequest(
  body: unknown,
  options: MockRequestOptions = {}
): Request {
  const {
    method = 'POST',
    headers = {},
    query = {},
    baseUrl = 'http://localhost:3000/api/test',
  } = options;

  // Build URL with query parameters
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  // Set default content type for POST/PUT/PATCH
  const requestHeaders = new Headers(headers);
  if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    if (!requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json');
    }
  }

  return new Request(url.toString(), {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Test a FormRequest with mock data
 *
 * @example
 * ```typescript
 * import { testFormRequest } from 'next-request/testing';
 *
 * describe('CreateUserRequest', () => {
 *   it('should validate valid data', async () => {
 *     const result = await testFormRequest(CreateUserRequest, {
 *       email: 'user@example.com',
 *       password: 'securepassword123',
 *     });
 *
 *     expect(result.success).toBe(true);
 *     expect(result.data?.email).toBe('user@example.com');
 *   });
 *
 *   it('should reject invalid email', async () => {
 *     const result = await testFormRequest(CreateUserRequest, {
 *       email: 'invalid-email',
 *       password: 'securepassword123',
 *     });
 *
 *     expect(result.success).toBe(false);
 *     expect(result.errors?.email).toBeDefined();
 *   });
 * });
 * ```
 */
export async function testFormRequest<T>(
  RequestClass: new () => FormRequest<T>,
  body: unknown,
  options: MockRequestOptions = {}
): Promise<MockValidationResult<T>> {
  const request = createMockRequest(body, options);

  // Use the static factory method
  const FormRequestWithStatic = RequestClass as unknown as {
    new (): FormRequest<T>;
    fromAppRouter(request: Request, params?: Record<string, string>): Promise<FormRequest<T>>;
  };

  const instance = await FormRequestWithStatic.fromAppRouter(request, options.params);

  try {
    const data = await instance.validate();
    return {
      success: true,
      data,
      instance,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        success: false,
        errors: error.errors,
        instance,
      };
    }
    if (error instanceof AuthorizationError) {
      return {
        success: false,
        unauthorized: true,
        instance,
      };
    }
    throw error;
  }
}

/**
 * Add static mock method to FormRequest class
 * This allows calling CreateUserRequest.mock({ ... }) directly
 *
 * @example
 * ```typescript
 * import { addMockMethod } from 'next-request/testing';
 *
 * // Add mock method to a specific request class
 * addMockMethod(CreateUserRequest);
 *
 * // Now you can use it directly
 * const result = await CreateUserRequest.mock({ email: 'invalid' });
 * expect(result.errors?.email).toBeDefined();
 * ```
 */
export function addMockMethod<T>(
  RequestClass: new () => FormRequest<T>
): void {
  (RequestClass as unknown as Record<string, unknown>).mock = async (
    body: unknown,
    options?: MockRequestOptions
  ) => testFormRequest(RequestClass, body, options);
}

/**
 * Type helper for FormRequest classes with mock method
 */
export interface MockableFormRequest<T> {
  new (): FormRequest<T>;
  mock(body: unknown, options?: MockRequestOptions): Promise<MockValidationResult<T>>;
}

/**
 * Assert that validation passes
 */
export function expectValid<T>(result: MockValidationResult<T>): asserts result is MockValidationResult<T> & { success: true; data: T } {
  if (!result.success) {
    const errorDetails = result.errors
      ? Object.entries(result.errors)
          .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
          .join('\n')
      : result.unauthorized
        ? 'Authorization denied'
        : 'Unknown error';
    throw new Error(`Expected validation to pass, but it failed:\n${errorDetails}`);
  }
}

/**
 * Assert that validation fails
 */
export function expectInvalid<T>(result: MockValidationResult<T>): asserts result is MockValidationResult<T> & { success: false; errors: ValidationErrors } {
  if (result.success) {
    throw new Error(`Expected validation to fail, but it passed with data: ${JSON.stringify(result.data)}`);
  }
  if (!result.errors) {
    throw new Error('Expected validation errors, but got none');
  }
}

/**
 * Assert that a specific field has errors
 */
export function expectFieldError<T>(
  result: MockValidationResult<T>,
  field: string,
  messagePattern?: string | RegExp
): void {
  expectInvalid(result);

  const fieldErrors = result.errors[field];
  if (!fieldErrors || fieldErrors.length === 0) {
    throw new Error(
      `Expected errors for field "${field}", but found none. Errors: ${JSON.stringify(result.errors)}`
    );
  }

  if (messagePattern) {
    const hasMatch = fieldErrors.some((msg) =>
      typeof messagePattern === 'string'
        ? msg.includes(messagePattern)
        : messagePattern.test(msg)
    );
    if (!hasMatch) {
      throw new Error(
        `Expected error for "${field}" to match "${messagePattern}", but got: ${fieldErrors.join(', ')}`
      );
    }
  }
}
