import type { NextApiRequest } from 'next';

/**
 * Validation errors mapped by field name to array of error messages
 */
export type ValidationErrors = Record<string, string[]>;

/**
 * Result of a validation operation
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrors;
}

/**
 * Configuration options for custom error messages and attribute names
 */
export interface ValidationConfig {
  messages?: Record<string, string>;
  attributes?: Record<string, string>;
}

/**
 * Adapter interface for validation libraries (Zod, Yup, etc.)
 */
export interface ValidatorAdapter<T> {
  /**
   * Validate data asynchronously
   */
  validate(data: unknown, config?: ValidationConfig): Promise<ValidationResult<T>>;

  /**
   * Validate data synchronously (optional)
   */
  validateSync?(data: unknown, config?: ValidationConfig): ValidationResult<T>;
}

/**
 * Data extracted from the incoming request
 */
export interface RequestData {
  body: unknown;
  query: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Union type for supported request types
 */
export type SupportedRequest = Request | NextApiRequest;

/**
 * Type guard to check if request is App Router Request
 */
export function isAppRouterRequest(request: SupportedRequest): request is Request {
  return 'headers' in request && request.headers instanceof Headers;
}

/**
 * Type guard to check if request is Pages Router NextApiRequest
 */
export function isPagesRouterRequest(request: SupportedRequest): request is NextApiRequest {
  return 'query' in request && !('headers' in request && request.headers instanceof Headers);
}

/**
 * Constructor type for FormRequest classes
 */
export interface FormRequestConstructor<T, TValidated> {
  new (): T;
  fromAppRouter(request: Request, params?: Record<string, string>): Promise<T>;
  fromPagesRouter(request: NextApiRequest, params?: Record<string, string>): Promise<T>;
}

/**
 * Handler function for App Router withRequest wrapper
 */
export type AppRouterHandler<TValidated> = (
  validated: TValidated,
  request: Request
) => Response | Promise<Response>;

/**
 * Handler function for Pages Router withApiRequest wrapper
 */
export type PagesRouterHandler<TValidated> = (
  validated: TValidated,
  request: NextApiRequest,
  response: import('next').NextApiResponse
) => void | Promise<void>;
