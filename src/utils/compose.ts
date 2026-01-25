import type { NextApiRequest } from 'next';
import { FormRequest } from '../core/FormRequest';
import type { ValidatorAdapter } from '../core/types';

/**
 * Base request class for common authorization patterns.
 * Extend this class to create reusable authorization logic.
 *
 * @example
 * ```typescript
 * // Create a base authenticated request
 * abstract class AuthenticatedRequest<T> extends FormRequest<T> {
 *   async authorize() {
 *     const token = this.header('authorization');
 *     if (!token) return false;
 *     // Verify token...
 *     return true;
 *   }
 * }
 *
 * // Create an admin request that inherits authentication
 * abstract class AdminRequest<T> extends AuthenticatedRequest<T> {
 *   async authorize() {
 *     // First check parent authorization
 *     if (!(await super.authorize())) return false;
 *     // Then check admin role...
 *     return this.isAdmin();
 *   }
 * }
 *
 * // Use in specific requests
 * class CreateProductRequest extends AdminRequest<CreateProductData> {
 *   rules() {
 *     return new ZodAdapter(createProductSchema);
 *   }
 *   // Automatically requires admin authorization!
 * }
 * ```
 */

/**
 * Mixin type for adding functionality to FormRequest classes
 */
export type FormRequestMixin<T> = {
  new <TValidated>(): FormRequest<TValidated> & T;
};

/**
 * Create an authenticated request base class
 *
 * @example
 * ```typescript
 * const AuthenticatedRequest = createAuthenticatedRequest(async (request) => {
 *   const token = request.header('authorization');
 *   return !!token && await verifyToken(token);
 * });
 *
 * class MyRequest extends AuthenticatedRequest<MyData> {
 *   rules() { return new ZodAdapter(schema); }
 * }
 * ```
 */
export function createAuthenticatedRequest<TBase = unknown>(
  authorizeFn: (request: FormRequest<TBase>) => boolean | Promise<boolean>
): abstract new <T>() => FormRequest<T> {
  abstract class AuthenticatedFormRequest<T> extends FormRequest<T> {
    async authorize(): Promise<boolean> {
      return authorizeFn(this as unknown as FormRequest<TBase>);
    }
  }
  return AuthenticatedFormRequest as abstract new <T>() => FormRequest<T>;
}

/**
 * Compose multiple authorization checks
 *
 * @example
 * ```typescript
 * const authorize = composeAuthorization(
 *   isAuthenticated,
 *   hasRole('admin'),
 *   hasPermission('products.create')
 * );
 *
 * class CreateProductRequest extends FormRequest<CreateProductData> {
 *   authorize = authorize;
 *   rules() { return new ZodAdapter(schema); }
 * }
 * ```
 */
export function composeAuthorization(
  ...checks: Array<(request: FormRequest<unknown>) => boolean | Promise<boolean>>
): (this: FormRequest<unknown>) => Promise<boolean> {
  return async function (this: FormRequest<unknown>): Promise<boolean> {
    for (const check of checks) {
      const result = await check(this);
      if (!result) return false;
    }
    return true;
  };
}

/**
 * Common authorization helpers
 */
export const authHelpers = {
  /**
   * Check if request has a specific header
   */
  hasHeader: (headerName: string) => (request: FormRequest<unknown>): boolean => {
    return !!request.header(headerName);
  },

  /**
   * Check if request has authorization header
   */
  isAuthenticated: (request: FormRequest<unknown>): boolean => {
    return !!request.header('authorization');
  },

  /**
   * Check if request has a bearer token
   */
  hasBearerToken: (request: FormRequest<unknown>): boolean => {
    const auth = request.header('authorization');
    return typeof auth === 'string' && auth.startsWith('Bearer ');
  },

  /**
   * Extract bearer token from request
   */
  getBearerToken: (request: FormRequest<unknown>): string | null => {
    const auth = request.header('authorization');
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  },

  /**
   * Check if request has API key
   */
  hasApiKey: (headerName: string = 'x-api-key') =>
    (request: FormRequest<unknown>): boolean => {
      return !!request.header(headerName);
    },
};

/**
 * Lifecycle hook composition utilities
 */
export const hookHelpers = {
  /**
   * Compose multiple beforeValidation hooks
   */
  beforeValidation: (...hooks: Array<(this: FormRequest<unknown>) => void | Promise<void>>) =>
    async function (this: FormRequest<unknown>): Promise<void> {
      for (const hook of hooks) {
        await hook.call(this);
      }
    },

  /**
   * Compose multiple afterValidation hooks
   */
  afterValidation: <T>(...hooks: Array<(this: FormRequest<T>, data: T) => void | Promise<void>>) =>
    async function (this: FormRequest<T>, data: T): Promise<void> {
      for (const hook of hooks) {
        await hook.call(this, data);
      }
    },

  /**
   * Common beforeValidation transformations
   */
  transforms: {
    /** Trim all string values */
    trimStrings: function (this: FormRequest<unknown>): void {
      const body = this.all();
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') {
          (body as Record<string, unknown>)[key] = value.trim();
        }
      }
    },

    /** Lowercase specific fields */
    lowercase: (...fields: string[]) =>
      function (this: FormRequest<unknown>): void {
        for (const field of fields) {
          const value = this.input(field);
          if (typeof value === 'string') {
            (this.all() as Record<string, unknown>)[field] = value.toLowerCase();
          }
        }
      },

    /** Uppercase specific fields */
    uppercase: (...fields: string[]) =>
      function (this: FormRequest<unknown>): void {
        for (const field of fields) {
          const value = this.input(field);
          if (typeof value === 'string') {
            (this.all() as Record<string, unknown>)[field] = value.toUpperCase();
          }
        }
      },
  },
};
