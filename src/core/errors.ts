import type { ValidationErrors } from './types';

/**
 * Error thrown when request validation fails
 */
export class ValidationError extends Error {
  public readonly errors: ValidationErrors;

  constructor(errors: ValidationErrors) {
    const firstError = Object.values(errors)[0]?.[0] ?? 'Validation failed';
    super(firstError);
    this.name = 'ValidationError';
    this.errors = errors;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }

  /**
   * Get all error messages as a flat array
   */
  getAllMessages(): string[] {
    return Object.values(this.errors).flat();
  }

  /**
   * Get errors for a specific field
   */
  getFieldErrors(field: string): string[] {
    return this.errors[field] ?? [];
  }

  /**
   * Check if a specific field has errors
   */
  hasFieldError(field: string): boolean {
    return field in this.errors && this.errors[field].length > 0;
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errors: this.errors,
    };
  }
}

/**
 * Error thrown when request authorization fails
 */
export class AuthorizationError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthorizationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthorizationError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
