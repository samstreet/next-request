import { describe, it, expect } from 'vitest';
import { ValidationError, AuthorizationError } from '../src/core/errors';

describe('ValidationError', () => {
  it('should create an error with validation errors', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required', 'Password must be at least 8 characters'],
    };

    const error = new ValidationError(errors);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.errors).toEqual(errors);
  });

  it('should set message to first error', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required'],
    };

    const error = new ValidationError(errors);

    expect(error.message).toBe('Invalid email format');
  });

  it('should handle empty errors', () => {
    const error = new ValidationError({});

    expect(error.message).toBe('Validation failed');
    expect(error.errors).toEqual({});
  });

  it('should return all messages as flat array', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required', 'Password must be at least 8 characters'],
    };

    const error = new ValidationError(errors);

    expect(error.getAllMessages()).toEqual([
      'Invalid email format',
      'Password is required',
      'Password must be at least 8 characters',
    ]);
  });

  it('should return field errors', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Password is required'],
    };

    const error = new ValidationError(errors);

    expect(error.getFieldErrors('email')).toEqual(['Invalid email format']);
    expect(error.getFieldErrors('password')).toEqual(['Password is required']);
    expect(error.getFieldErrors('unknown')).toEqual([]);
  });

  it('should check if field has errors', () => {
    const errors = {
      email: ['Invalid email format'],
      empty: [],
    };

    const error = new ValidationError(errors);

    expect(error.hasFieldError('email')).toBe(true);
    expect(error.hasFieldError('empty')).toBe(false);
    expect(error.hasFieldError('unknown')).toBe(false);
  });

  it('should serialize to JSON', () => {
    const errors = {
      email: ['Invalid email format'],
    };

    const error = new ValidationError(errors);
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'ValidationError',
      message: 'Invalid email format',
      errors: { email: ['Invalid email format'] },
    });
  });
});

describe('AuthorizationError', () => {
  it('should create an error with default message', () => {
    const error = new AuthorizationError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.name).toBe('AuthorizationError');
    expect(error.message).toBe('Unauthorized');
  });

  it('should create an error with custom message', () => {
    const error = new AuthorizationError('Access denied');

    expect(error.message).toBe('Access denied');
  });

  it('should serialize to JSON', () => {
    const error = new AuthorizationError('Forbidden');
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'AuthorizationError',
      message: 'Forbidden',
    });
  });
});
