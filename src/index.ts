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

export {
  withSchema,
  withApiSchema,
} from './middleware/withSchema';

// Adapters
export { ZodAdapter } from './adapters/validators/ZodAdapter';
export { YupAdapter } from './adapters/validators/YupAdapter';
export { ValibotAdapter } from './adapters/validators/ValibotAdapter';
export { ArkTypeAdapter } from './adapters/validators/ArkTypeAdapter';

// File Upload Utilities
export {
  formFile,
  formFiles,
  type FormFileOptions,
  type ValidatedFile,
  type InferFormFile,
  type InferFormFiles,
} from './utils/formFile';

// Rate Limiting
export {
  checkRateLimit,
  rateLimit,
  RateLimitError,
  MemoryRateLimitStore,
  setDefaultRateLimitStore,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitState,
  type RateLimitStore,
} from './utils/rateLimit';

// Coercion Utilities
export {
  coerceFormData,
  zodCoerce,
  coercionPresets,
  type CoercionOptions,
} from './utils/coerce';

// Error Formatting
export {
  formatErrors,
  flattenErrors,
  summarizeErrors,
  filterErrors,
  mergeErrors,
  type StructuredErrors,
  type ErrorFormattingOptions,
} from './utils/errorFormatting';

// Testing Utilities
export {
  testFormRequest,
  createMockRequest,
  addMockMethod,
  expectValid,
  expectInvalid,
  expectFieldError,
  type MockValidationResult,
  type MockRequestOptions,
  type MockableFormRequest,
} from './utils/testing';

// Composition Utilities
export {
  createAuthenticatedRequest,
  composeAuthorization,
  authHelpers,
  hookHelpers,
} from './utils/compose';
