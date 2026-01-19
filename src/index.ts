/**
 * next-request
 *
 * Laravel-inspired Form Request validation for Next.js API routes.
 *
 * @example
 * ```typescript
 * import { FormRequest, ZodAdapter, ValidationError, AuthorizationError } from 'next-request';
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
 *     return true;
 *   }
 *
 *   beforeValidation() {
 *     this.body.email = this.body.email?.toLowerCase().trim();
 *   }
 * }
 *
 * // Usage in App Router:
 * export async function POST(request: Request) {
 *   try {
 *     const form = await LoginRequest.fromAppRouter(request);
 *     const data = await form.validate();
 *     // data is fully typed as { email: string; password: string }
 *   } catch (error) {
 *     if (error instanceof ValidationError) {
 *       return Response.json({ errors: error.errors }, { status: 422 });
 *     }
 *     throw error;
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// Core
export { FormRequest } from './core/FormRequest';
export { ValidationError, AuthorizationError } from './core/errors';

// Types
export type {
  ValidatorAdapter,
  ValidationResult,
  ValidationErrors,
  ValidationConfig,
  RequestData,
  SupportedRequest,
  AppRouterHandler,
  PagesRouterHandler,
} from './core/types';

export {
  isAppRouterRequest,
  isPagesRouterRequest,
} from './core/types';

// Middleware
export {
  withRequest,
  withApiRequest,
  createAppRouterWrapper,
  createPagesRouterWrapper,
} from './middleware/withRequest';

// Adapters
export { ZodAdapter } from './adapters/validators/ZodAdapter';
