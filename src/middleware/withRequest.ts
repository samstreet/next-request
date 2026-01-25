import type { NextApiRequest, NextApiResponse } from 'next';
import { FormRequest } from '../core/FormRequest';
import { ValidationError, AuthorizationError } from '../core/errors';

/**
 * Extract the validated type from a FormRequest constructor
 * This works by:
 * 1. Getting the instance type from the constructor: InstanceType<T>
 * 2. Checking if that instance extends FormRequest<infer V>
 * 3. Extracting V which is the TValidated generic parameter
 */
type InferValidatedType<T extends new () => any> =
  InstanceType<T> extends FormRequest<infer V> ? V : never;

/**
 * Type for FormRequest constructor (legacy - kept for backward compatibility)
 */
type FormRequestClass<TValidated> = {
  new (): FormRequest<TValidated>;
  fromAppRouter(request: Request, params?: Record<string, string>): Promise<FormRequest<TValidated>>;
  fromPagesRouter(request: NextApiRequest, params?: Record<string, string>): Promise<FormRequest<TValidated>>;
};

/**
 * Handler function for App Router
 */
type AppRouterHandler<TValidated> = (
  validated: TValidated,
  request: Request,
  formRequest: FormRequest<TValidated>
) => Response | Promise<Response>;

/**
 * Handler function for Pages Router
 */
type PagesRouterHandler<TValidated> = (
  validated: TValidated,
  req: NextApiRequest,
  res: NextApiResponse,
  formRequest: FormRequest<TValidated>
) => void | Promise<void>;

/**
 * Context parameter for App Router (Next.js 13+)
 */
interface AppRouterContext {
  params?: Record<string, string> | Promise<Record<string, string>>;
}

/**
 * Wrap an App Router route handler with form request validation.
 *
 * The handler receives validated data and only executes if:
 * 1. Authorization passes (authorize() returns true)
 * 2. Validation passes (rules() validates successfully)
 *
 * Errors are thrown, not auto-handled - catch ValidationError and
 * AuthorizationError in your handler or error boundary.
 *
 * @example
 * ```typescript
 * // app/api/users/route.ts
 * import { withRequest } from 'next-request';
 * import { CreateUserRequest } from '@/requests/CreateUserRequest';
 *
 * export const POST = withRequest(CreateUserRequest, async (data, request) => {
 *   const user = await db.users.create({ data });
 *   return Response.json({ user }, { status: 201 });
 * });
 * ```
 */
export function withRequest<T extends new () => FormRequest<any>>(
  RequestClass: T & {
    fromAppRouter(request: Request, params?: Record<string, string>): Promise<InstanceType<T>>;
  },
  handler: AppRouterHandler<InferValidatedType<T>>
): (request: Request, context?: AppRouterContext) => Promise<Response> {
  return async (request: Request, context?: AppRouterContext) => {
    // Resolve params (may be a Promise in Next.js 15+)
    const params = context?.params
      ? (context.params instanceof Promise ? await context.params : context.params)
      : {};

    const formRequest = await RequestClass.fromAppRouter(request, params);
    const validated = await formRequest.validate();

    return handler(validated, request, formRequest);
  };
}

/**
 * Wrap a Pages Router API handler with form request validation.
 *
 * The handler receives validated data and only executes if:
 * 1. Authorization passes (authorize() returns true)
 * 2. Validation passes (rules() validates successfully)
 *
 * Errors are thrown, not auto-handled - catch ValidationError and
 * AuthorizationError in your handler.
 *
 * @example
 * ```typescript
 * // pages/api/users.ts
 * import { withApiRequest } from 'next-request';
 * import { CreateUserRequest } from '@/requests/CreateUserRequest';
 *
 * export default withApiRequest(CreateUserRequest, async (data, req, res) => {
 *   const user = await db.users.create({ data });
 *   res.status(201).json({ user });
 * });
 * ```
 */
export function withApiRequest<T extends new () => FormRequest<any>>(
  RequestClass: T & {
    fromPagesRouter(request: NextApiRequest, params?: Record<string, string>): Promise<InstanceType<T>>;
  },
  handler: PagesRouterHandler<InferValidatedType<T>>
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const formRequest = await RequestClass.fromPagesRouter(req);
    const validated = await formRequest.validate();

    await handler(validated, req, res, formRequest);
  };
}

/**
 * Create a wrapper with custom error handling for App Router.
 *
 * @example
 * ```typescript
 * import { createAppRouterWrapper, ValidationError, AuthorizationError } from 'next-request';
 *
 * const withValidation = createAppRouterWrapper({
 *   onValidationError: (error) => Response.json({ errors: error.errors }, { status: 422 }),
 *   onAuthorizationError: () => Response.json({ message: 'Forbidden' }, { status: 403 }),
 * });
 *
 * export const POST = withValidation(CreateUserRequest, async (data) => {
 *   const user = await db.users.create({ data });
 *   return Response.json({ user }, { status: 201 });
 * });
 * ```
 */
export function createAppRouterWrapper(options: {
  onValidationError?: (error: ValidationError) => Response;
  onAuthorizationError?: (error: AuthorizationError) => Response;
  onError?: (error: unknown) => Response;
}): <T extends new () => FormRequest<any>>(
  RequestClass: T & {
    fromAppRouter(request: Request, params?: Record<string, string>): Promise<InstanceType<T>>;
  },
  handler: AppRouterHandler<InferValidatedType<T>>
) => (request: Request, context?: AppRouterContext) => Promise<Response> {
  return <T extends new () => FormRequest<any>>(
    RequestClass: T & {
      fromAppRouter(request: Request, params?: Record<string, string>): Promise<InstanceType<T>>;
    },
    handler: AppRouterHandler<InferValidatedType<T>>
  ) => {
    return async (request: Request, context?: AppRouterContext) => {
      try {
        const params = context?.params
          ? (context.params instanceof Promise ? await context.params : context.params)
          : {};

        const formRequest = await RequestClass.fromAppRouter(request, params);
        const validated = await formRequest.validate();

        return handler(validated, request, formRequest);
      } catch (error) {
        if (error instanceof ValidationError && options.onValidationError) {
          return options.onValidationError(error);
        }
        if (error instanceof AuthorizationError && options.onAuthorizationError) {
          return options.onAuthorizationError(error);
        }
        if (options.onError) {
          return options.onError(error);
        }
        throw error;
      }
    };
  };
}

/**
 * Create a wrapper with custom error handling for Pages Router.
 *
 * @example
 * ```typescript
 * import { createPagesRouterWrapper, ValidationError, AuthorizationError } from 'next-request';
 *
 * const withValidation = createPagesRouterWrapper({
 *   onValidationError: (error, req, res) => res.status(422).json({ errors: error.errors }),
 *   onAuthorizationError: (error, req, res) => res.status(403).json({ message: 'Forbidden' }),
 * });
 *
 * export default withValidation(CreateUserRequest, async (data, req, res) => {
 *   const user = await db.users.create({ data });
 *   res.status(201).json({ user });
 * });
 * ```
 */
export function createPagesRouterWrapper(options: {
  onValidationError?: (
    error: ValidationError,
    req: NextApiRequest,
    res: NextApiResponse
  ) => void | Promise<void>;
  onAuthorizationError?: (
    error: AuthorizationError,
    req: NextApiRequest,
    res: NextApiResponse
  ) => void | Promise<void>;
  onError?: (
    error: unknown,
    req: NextApiRequest,
    res: NextApiResponse
  ) => void | Promise<void>;
}): <T extends new () => FormRequest<any>>(
  RequestClass: T & {
    fromPagesRouter(request: NextApiRequest, params?: Record<string, string>): Promise<InstanceType<T>>;
  },
  handler: PagesRouterHandler<InferValidatedType<T>>
) => (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  return <T extends new () => FormRequest<any>>(
    RequestClass: T & {
      fromPagesRouter(request: NextApiRequest, params?: Record<string, string>): Promise<InstanceType<T>>;
    },
    handler: PagesRouterHandler<InferValidatedType<T>>
  ) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        const formRequest = await RequestClass.fromPagesRouter(req);
        const validated = await formRequest.validate();

        await handler(validated, req, res, formRequest);
      } catch (error) {
        if (error instanceof ValidationError && options.onValidationError) {
          return options.onValidationError(error, req, res);
        }
        if (error instanceof AuthorizationError && options.onAuthorizationError) {
          return options.onAuthorizationError(error, req, res);
        }
        if (options.onError) {
          return options.onError(error, req, res);
        }
        throw error;
      }
    };
  };
}
