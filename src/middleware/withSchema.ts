import type { NextApiRequest, NextApiResponse } from 'next';
import type { ValidatorAdapter } from '../core/types';
import { ValidationError } from '../core/errors';

/**
 * Infer the validated type from a ValidationAdapter
 * This extracts the generic type parameter T from ValidatorAdapter<T>
 */
type InferValidatedType<T> = T extends ValidatorAdapter<infer V> ? V : never;

/**
 * Handler function for App Router with schema validation
 */
type SchemaHandler<TValidated> = (
  data: TValidated,
  request: Request
) => Response | Promise<Response>;

/**
 * Handler function for Pages Router with schema validation
 */
type ApiSchemaHandler<TValidated> = (
  data: TValidated,
  req: NextApiRequest,
  res: NextApiResponse
) => void | Promise<void>;

/**
 * Context parameter for App Router (Next.js 13+)
 */
interface AppRouterContext {
  params?: Record<string, string> | Promise<Record<string, string>>;
}

/**
 * Parse request body based on content type
 */
async function parseRequestBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      const data: Record<string, unknown> = {};

      formData.forEach((value, key) => {
        if (data[key]) {
          // Handle multiple values for same key
          if (Array.isArray(data[key])) {
            (data[key] as unknown[]).push(value);
          } else {
            data[key] = [data[key], value];
          }
        } else {
          data[key] = value;
        }
      });

      return data;
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Wrap an App Router route handler with simple schema validation.
 *
 * This is a lightweight alternative to withRequest for cases where you don't need
 * hooks or authorization - just schema validation.
 *
 * The handler receives validated data and only executes if validation passes.
 * ValidationError is thrown on validation failure.
 *
 * @example
 * ```typescript
 * // app/api/users/route.ts
 * import { withSchema, ZodAdapter } from 'next-request';
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   name: z.string().min(2),
 *   email: z.string().email(),
 * });
 *
 * export const POST = withSchema(new ZodAdapter(userSchema), async (data) => {
 *   // data is typed as { name: string; email: string }
 *   const user = await db.users.create({ data });
 *   return Response.json({ user }, { status: 201 });
 * });
 * ```
 */
export function withSchema<T extends ValidatorAdapter<any>>(
  adapter: T,
  handler: SchemaHandler<InferValidatedType<T>>
): (request: Request, context?: AppRouterContext) => Promise<Response> {
  return async (request: Request, context?: AppRouterContext) => {
    // Parse request body
    const body = await parseRequestBody(request);

    // Validate the data
    const result = await adapter.validate(body);

    if (!result.success) {
      throw new ValidationError(result.errors || {});
    }

    // Call handler with validated data
    return handler(result.data as InferValidatedType<T>, request);
  };
}

/**
 * Wrap a Pages Router API handler with simple schema validation.
 *
 * This is a lightweight alternative to withApiRequest for cases where you don't need
 * hooks or authorization - just schema validation.
 *
 * The handler receives validated data and only executes if validation passes.
 * ValidationError is thrown on validation failure.
 *
 * @example
 * ```typescript
 * // pages/api/users.ts
 * import { withApiSchema, ZodAdapter } from 'next-request';
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   name: z.string().min(2),
 *   email: z.string().email(),
 * });
 *
 * export default withApiSchema(new ZodAdapter(userSchema), async (data, req, res) => {
 *   // data is typed as { name: string; email: string }
 *   const user = await db.users.create({ data });
 *   res.status(201).json({ user });
 * });
 * ```
 */
export function withApiSchema<T extends ValidatorAdapter<any>>(
  adapter: T,
  handler: ApiSchemaHandler<InferValidatedType<T>>
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Get body from request (Next.js Pages Router automatically parses JSON)
    const body = req.body;

    // Validate the data
    const result = await adapter.validate(body);

    if (!result.success) {
      throw new ValidationError(result.errors || {});
    }

    // Call handler with validated data
    await handler(result.data as InferValidatedType<T>, req, res);
  };
}
